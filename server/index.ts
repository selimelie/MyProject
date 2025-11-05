import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import session from "express-session";
import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { storage } from "./storage";
import bcrypt from "bcrypt";
import { wsManager } from "./websocket";
import { subscriptionAutomation } from "./subscription-automation";
import connectPgSimple from "connect-pg-simple";
import { db } from "./db";
import { sql } from "drizzle-orm";

const app = express();

if (process.env.NODE_ENV === "production") {
  app.set("trust proxy", 1);
}

const allowedOrigins = (process.env.CORS_ALLOWED_ORIGINS || "")
  .split(",")
  .map(origin => origin.trim())
  .filter(origin => origin.length > 0);

const parsedWindowMs = Number(process.env.RATE_LIMIT_WINDOW_MS);
const rateLimitWindowMs = Number.isFinite(parsedWindowMs) && parsedWindowMs > 0 ? parsedWindowMs : 15 * 60 * 1000;

const parsedRateLimitMax = Number(process.env.RATE_LIMIT_MAX);
const rateLimitMax = Number.isFinite(parsedRateLimitMax) && parsedRateLimitMax > 0 ? parsedRateLimitMax : 100;

interface RateLimitResult {
  allowed: boolean;
  retryAfterSeconds?: number;
}

let rateLimitTableInitialized = false;
let rateLimitCleanupScheduled = false;

async function ensureRateLimitTable(): Promise<void> {
  if (!rateLimitTableInitialized) {
    await db.execute(
      sql`CREATE TABLE IF NOT EXISTS api_rate_limits (
        identifier TEXT PRIMARY KEY,
        count INTEGER NOT NULL,
        reset_at TIMESTAMPTZ NOT NULL
      )`
    );
    rateLimitTableInitialized = true;
  }

  if (!rateLimitCleanupScheduled) {
    setInterval(() => {
      void (async () => {
        try {
          await db.execute(sql`DELETE FROM api_rate_limits WHERE reset_at <= NOW()`);
        } catch (error) {
          console.error("[RateLimit] cleanup failed:", error);
        }
      })();
    }, rateLimitWindowMs).unref();
    rateLimitCleanupScheduled = true;
  }
}

async function consumeRateLimit(key: string): Promise<RateLimitResult> {
  await ensureRateLimitTable();

  try {
    const now = new Date();
    const resetAt = new Date(now.getTime() + rateLimitWindowMs);

    const result = await db.execute(
      sql`INSERT INTO api_rate_limits (identifier, count, reset_at)
          VALUES (${key}, 1, ${resetAt})
          ON CONFLICT (identifier) DO UPDATE
          SET
            count = CASE
              WHEN api_rate_limits.reset_at <= ${now} THEN 1
              ELSE LEAST(api_rate_limits.count + 1, ${rateLimitMax + 1})
            END,
            reset_at = CASE
              WHEN api_rate_limits.reset_at <= ${now} THEN ${resetAt}
              ELSE api_rate_limits.reset_at
            END
          RETURNING count, reset_at;`
    );

    const rows = (result as unknown as { rows?: Array<{ count: number; reset_at: Date | string }> }).rows;
    const row = rows?.[0];

    if (!row) {
      return { allowed: true };
    }

    const total = Number(row.count);
    const resetDate = row.reset_at instanceof Date ? row.reset_at : new Date(row.reset_at);

    if (Number.isNaN(total)) {
      return { allowed: true };
    }

    if (total > rateLimitMax) {
      const retryAfterSeconds = Math.max(1, Math.ceil((resetDate.getTime() - now.getTime()) / 1000));
      return { allowed: false, retryAfterSeconds };
    }

    return { allowed: true };
  } catch (error) {
    console.error("[RateLimit] Failed to update limiter state:", error);
    return { allowed: true };
  }
}

declare module "http" {
  interface IncomingMessage {
    rawBody?: Buffer;
  }
}

app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  res.setHeader("Cross-Origin-Resource-Policy", "same-site");

  if (process.env.CONTENT_SECURITY_POLICY) {
    res.setHeader("Content-Security-Policy", process.env.CONTENT_SECURITY_POLICY);
  }

  next();
});

app.use((req, res, next) => {
  const origin = req.headers.origin;
  const allowAnyOrigin = allowedOrigins.length === 0;

  if (origin && (allowAnyOrigin || allowedOrigins.includes(origin))) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }

  const varyHeader = res.getHeader("Vary");
  if (!varyHeader) {
    res.setHeader("Vary", "Origin");
  } else if (typeof varyHeader === "string") {
    if (!varyHeader.split(/,\s*/).includes("Origin")) {
      res.setHeader("Vary", `${varyHeader}, Origin`);
    }
  } else if (Array.isArray(varyHeader)) {
    if (!varyHeader.map(String).includes("Origin")) {
      res.setHeader("Vary", [...varyHeader, "Origin"].join(", "));
    }
  }
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With");

  if (req.method === "OPTIONS") {
    res.sendStatus(204);
    return;
  }

  next();
});

app.use((req, res, next) => {
  if (!req.path.startsWith("/api")) {
    return next();
  }

  const key = req.ip || req.socket.remoteAddress || "unknown";

  consumeRateLimit(key)
    .then((result) => {
      if (!result.allowed) {
        if (result.retryAfterSeconds) {
          res.setHeader("Retry-After", result.retryAfterSeconds.toString());
        }
        res.status(429).json({ message: "Too many requests" });
        return;
      }

      next();
    })
    .catch((error) => {
      console.error("[RateLimit] Middleware failure:", error);
      next();
    });
});
app.use(express.json({
  verify: (req, _res, buf) => {
    req.rawBody = Buffer.isBuffer(buf) ? buf : Buffer.from(buf);
  }
}));
app.use(express.urlencoded({ extended: false }));

const sessionSecret = process.env.SESSION_SECRET;
if (!sessionSecret) {
  throw new Error("SESSION_SECRET must be set for secure sessions");
}

const PgSessionStore = connectPgSimple(session);

const sessionStore = new PgSessionStore({
  conString: process.env.DATABASE_URL!,
  createTableIfMissing: true,
});

// Session configuration
const sessionMiddleware = session({
  secret: sessionSecret,
  resave: false,
  saveUninitialized: false,
  store: sessionStore,
  cookie: {
    secure: process.env.NODE_ENV === "production",
    sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
    httpOnly: true,
    maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days
  },
});

app.use(sessionMiddleware);

// Passport initialization
const passportInitialize = passport.initialize();
const passportSession = passport.session();

app.use(passportInitialize);
app.use(passportSession);

// Passport Local Strategy
passport.use(
  new LocalStrategy(
    {
      usernameField: "email",
      passwordField: "password",
    },
    async (email, password, done) => {
      try {
        const user = await storage.getUserByEmail(email);
        if (!user) {
          return done(null, false, { message: "Invalid credentials" });
        }

        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) {
          return done(null, false, { message: "Invalid credentials" });
        }

        return done(null, user);
      } catch (error) {
        return done(error);
      }
    }
  )
);

// Passport serialization
passport.serializeUser((user: any, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id: number, done) => {
  try {
    const user = await storage.getUser(id);
    done(null, user);
  } catch (error) {
    done(error);
  }
});

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  await ensureRateLimitTable();
  const server = await registerRoutes(app);

  // Initialize WebSocket server with session middleware
  wsManager.initialize(server, sessionMiddleware, passportInitialize, passportSession);

  // Start subscription automation cron job
  subscriptionAutomation.start();

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || '5000', 10);
  server.listen({
    port,
    host: "0.0.0.0",
    reusePort: true,
  }, () => {
    log(`serving on port ${port}`);
  });
})();
