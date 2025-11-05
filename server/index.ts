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
const rateLimitStore = new Map<string, { count: number; resetTime: number }>();

setInterval(() => {
  const now = Date.now();
  for (const [key, value] of rateLimitStore.entries()) {
    if (value.resetTime <= now) {
      rateLimitStore.delete(key);
    }
  }
}, rateLimitWindowMs).unref();

declare module 'http' {
  interface IncomingMessage {
    rawBody: unknown
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
  const now = Date.now();
  const existing = rateLimitStore.get(key);

  if (!existing || existing.resetTime <= now) {
    rateLimitStore.set(key, { count: 1, resetTime: now + rateLimitWindowMs });
    return next();
  }

  if (existing.count >= rateLimitMax) {
    const retryAfter = Math.max(1, Math.ceil((existing.resetTime - now) / 1000));
    res.setHeader("Retry-After", retryAfter.toString());
    return res.status(429).json({ message: "Too many requests" });
  }

  existing.count += 1;
  next();
});
app.use(express.json({
  verify: (req, _res, buf) => {
    req.rawBody = buf;
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
