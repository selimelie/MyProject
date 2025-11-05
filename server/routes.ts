import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { generateAIResponse, parseIntent } from "./ai";
import { checkAvailability, getAvailableSlots, createCalendarEvent } from "./calendar";
import { exportCatalogToSheets, isSheetsConfigured, syncCatalogFromSheets } from "./sheets";
import bcrypt from "bcrypt";
import { sql } from "drizzle-orm";
import { db } from "./db";
import { orders, appointments, products, services, type Product, type Conversation } from "@shared/schema";
import Stripe from "stripe";
import { wsManager, WS_EVENTS } from "./websocket";
import { subscriptionAutomation } from "./subscription-automation";

// Initialize Stripe
if (!process.env.STRIPE_SECRET_KEY) {
  console.warn('Warning: STRIPE_SECRET_KEY not set. Stripe features will not work.');
}
const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null;

const isProduction = process.env.NODE_ENV === 'production';
const stripeWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

if (!stripeWebhookSecret) {
  const message = 'STRIPE_WEBHOOK_SECRET must be configured to verify Stripe webhooks.';
  if (isProduction) {
    throw new Error(message);
  } else {
    console.warn(message);
  }
}

const metaVerifyToken = process.env.META_VERIFY_TOKEN;

if (!metaVerifyToken) {
  const message = 'META_VERIFY_TOKEN must be configured to verify Meta webhooks.';
  if (isProduction) {
    throw new Error(message);
  } else {
    console.warn(message);
  }
}

const metaSourceToShop = new Map<string, number>();
const metaMapping = process.env.META_SHOP_MAP;

if (metaMapping) {
  for (const pair of metaMapping.split(",")) {
    const [sourceId, shopIdValue] = pair.split(":").map((value) => value.trim());
    const parsedShopId = Number(shopIdValue);

    if (sourceId && !Number.isNaN(parsedShopId)) {
      metaSourceToShop.set(sourceId, parsedShopId);
    }
  }
}

const defaultMetaShopId = process.env.META_DEFAULT_SHOP_ID ? Number(process.env.META_DEFAULT_SHOP_ID) : null;

const ORDER_CONFIRMATION_KEYWORDS = ["processing", "order", "confirmed", "completed", "successfully"];

function resolveMetaShopId(sourceId: string): number | null {
  if (metaSourceToShop.has(sourceId)) {
    return metaSourceToShop.get(sourceId)!;
  }

  if (defaultMetaShopId !== null && !Number.isNaN(defaultMetaShopId)) {
    return defaultMetaShopId;
  }

  return null;
}

// Middleware to check authentication
const requireAuth = (req: any, res: any, next: any) => {
  if (!req.isAuthenticated || !req.isAuthenticated()) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  next();
};

// Middleware to check specific roles
const requireRole = (...roles: string[]) => {
  return (req: any, res: any, next: any) => {
    if (!req.isAuthenticated || !req.isAuthenticated()) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    
    const user = req.user as any;
    if (!roles.includes(user.role)) {
      return res.status(403).json({ message: "Forbidden - Insufficient permissions" });
    }
    
    next();
  };
};

export async function registerRoutes(app: Express): Promise<Server> {
  async function maybeCreateOrderFromConversation(params: {
    shopId: number;
    conversation: Conversation;
    productsList: Product[];
    aiResponse: string;
    intent: ReturnType<typeof parseIntent>;
    recentUserMessages: string;
    platform?: string;
  }): Promise<void> {
    const { shopId, conversation, productsList, aiResponse, intent, recentUserMessages, platform } = params;

    if (intent.type !== "order") {
      return;
    }

    const aiResponseNormalized = aiResponse.toLowerCase();
    if (!ORDER_CONFIRMATION_KEYWORDS.some((keyword) => aiResponseNormalized.includes(keyword))) {
      return;
    }

    const nameMatch = recentUserMessages.match(/(?:name is|i'm|i am)\s+([A-Za-z\s]+?)(?:,|\.|and|phone|$)/i);
    const phoneMatch = recentUserMessages.match(/(?:phone|number|contact)\s*(?:is)?\s*([0-9+\-]+)/i);
    const quantityMatch = recentUserMessages.match(/(\d+)\s*(?:units?|items?|pieces?)/i);

    const customerName = nameMatch ? nameMatch[1].trim() : conversation.customerName || "Customer";
    const customerPhone = phoneMatch ? phoneMatch[1].trim() : conversation.customerId;
    const quantity = quantityMatch ? parseInt(quantityMatch[1], 10) : 1;

    const mentionedProduct = productsList.find((product) => {
      const productName = product.name.toLowerCase();
      return recentUserMessages.toLowerCase().includes(productName) || aiResponseNormalized.includes(productName);
    });

    if (!mentionedProduct) {
      return;
    }

    if (mentionedProduct.stock < quantity) {
      return;
    }

    const unitPrice = Number(mentionedProduct.price);
    const unitCost = Number(mentionedProduct.cost ?? 0);

    if (Number.isNaN(unitPrice) || Number.isNaN(unitCost)) {
      return;
    }

    const revenue = unitPrice * quantity;
    const profit = revenue - unitCost * quantity;

    try {
      const order = await storage.createOrder({
        shopId,
        productId: mentionedProduct.id,
        productName: mentionedProduct.name,
        quantity,
        price: unitPrice.toFixed(2),
        cost: unitCost.toFixed(2),
        revenue: revenue.toFixed(2),
        profit: profit.toFixed(2),
        customerName,
        customerPhone,
        platform: platform || conversation.platform,
        status: "pending",
      });

      await storage.updateProduct(mentionedProduct.id, shopId, {
        stock: mentionedProduct.stock - quantity,
      });

      if (!conversation.customerName && customerName) {
        await storage.updateConversation(conversation.id, shopId, {
          customerName,
        });
      }

      wsManager.broadcastToShop(shopId, {
        type: WS_EVENTS.ORDER_CREATED,
        data: order,
        timestamp: Date.now(),
      });
    } catch (error) {
      console.error("[Order Creation Failed]", error);
    }
  }

  // ==================== AUTHENTICATION ====================
  app.post("/api/auth/register", async (req, res) => {
    try {
      const { businessName, email, password, businessType } = req.body;

      // Check if shop already exists
      const existingShop = await storage.getShopByEmail(email);
      if (existingShop) {
        return res.status(400).json({ message: "Business already registered with this email" });
      }

      // Create shop
      const shop = await storage.createShop({
        name: businessName,
        ownerEmail: email,
        businessType,
        plan: "starter",
        status: "active",
      });

      // Create owner user
      const hashedPassword = await bcrypt.hash(password, 10);
      const user = await storage.createUser({
        shopId: shop.id,
        username: businessName,
        email,
        password: hashedPassword,
        role: "owner",
      });

      // Create initial subscription
      const expiryDate = new Date();
      expiryDate.setDate(expiryDate.getDate() + 14); // 14 day trial
      
      await storage.createSubscription({
        shopId: shop.id,
        plan: "starter",
        status: "active",
        expiryDate,
      });

      // Log in the user
      req.login(user, (err: any) => {
        if (err) {
          return res.status(500).json({ message: "Registration successful but login failed" });
        }
        res.json({ user: { id: user.id, email: user.email, role: user.role } });
      });
    } catch (error: any) {
      console.error("Registration error:", error);
      res.status(500).json({ message: error.message || "Registration failed" });
    }
  });

  app.post("/api/auth/login", async (req, res) => {
    try {
      const { email, password } = req.body;

      const user = await storage.getUserByEmail(email);
      if (!user) {
        return res.status(401).json({ message: "Invalid credentials" });
      }

      const validPassword = await bcrypt.compare(password, user.password);
      if (!validPassword) {
        return res.status(401).json({ message: "Invalid credentials" });
      }

      req.login(user, (err: any) => {
        if (err) {
          return res.status(500).json({ message: "Login failed" });
        }
        res.json({ user: { id: user.id, email: user.email, role: user.role } });
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message || "Login failed" });
    }
  });

  app.post("/api/auth/logout", (req, res) => {
    req.logout((err: any) => {
      if (err) {
        return res.status(500).json({ message: "Logout failed" });
      }
      res.json({ message: "Logged out successfully" });
    });
  });

  app.get("/api/auth/me", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const userWithShop = await storage.getUserWithShop(user.id);
      
      if (!userWithShop) {
        return res.status(404).json({ message: "User not found" });
      }

      res.json({
        id: userWithShop.id,
        email: userWithShop.email,
        role: userWithShop.role,
        shop: {
          id: userWithShop.shop.id,
          name: userWithShop.shop.name,
          plan: userWithShop.shop.plan,
        },
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ==================== PRODUCTS ====================
  app.get("/api/products", requireAuth, requireRole("owner", "order_manager"), async (req, res) => {
    try {
      const user = req.user as any;
      const products = await storage.getProducts(user.shopId);
      res.json(products);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/products", requireAuth, requireRole("owner"), async (req, res) => {
    try {
      const user = req.user as any;
      const product = await storage.createProduct({
        ...req.body,
        shopId: user.shopId,
      });
      res.json(product);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.put("/api/products/:id", requireAuth, requireRole("owner"), async (req, res) => {
    try {
      const user = req.user as any;
      const product = await storage.updateProduct(
        parseInt(req.params.id),
        user.shopId,
        req.body
      );
      res.json(product);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.delete("/api/products/:id", requireAuth, requireRole("owner"), async (req, res) => {
    try {
      const user = req.user as any;
      await storage.deleteProduct(parseInt(req.params.id), user.shopId);
      res.json({ message: "Product deleted" });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ==================== SERVICES ====================
  app.get("/api/services", requireAuth, requireRole("owner", "order_manager"), async (req, res) => {
    try {
      const user = req.user as any;
      const services = await storage.getServices(user.shopId);
      res.json(services);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/services", requireAuth, requireRole("owner"), async (req, res) => {
    try {
      const user = req.user as any;
      const service = await storage.createService({
        ...req.body,
        shopId: user.shopId,
      });
      res.json(service);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.put("/api/services/:id", requireAuth, requireRole("owner"), async (req, res) => {
    try {
      const user = req.user as any;
      const service = await storage.updateService(
        parseInt(req.params.id),
        user.shopId,
        req.body
      );
      res.json(service);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.delete("/api/services/:id", requireAuth, requireRole("owner"), async (req, res) => {
    try {
      const user = req.user as any;
      await storage.deleteService(parseInt(req.params.id), user.shopId);
      res.json({ message: "Service deleted" });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ==================== GOOGLE SHEETS SYNC ====================
  app.get("/api/integrations/sheets/status", requireAuth, requireRole("owner"), (_req, res) => {
    res.json({ configured: isSheetsConfigured() });
  });

  app.post("/api/integrations/sheets/import", requireAuth, requireRole("owner"), async (req, res) => {
    try {
      if (!isSheetsConfigured()) {
        return res.status(503).json({ message: "Google Sheets integration is not configured" });
      }

      const user = req.user as any;
      const result = await syncCatalogFromSheets(user.shopId);
      res.json(result);
    } catch (error: any) {
      console.error("Google Sheets import failed:", error);
      res.status(500).json({ message: error.message || "Failed to import catalog from Google Sheets" });
    }
  });

  app.post("/api/integrations/sheets/export", requireAuth, requireRole("owner"), async (req, res) => {
    try {
      if (!isSheetsConfigured()) {
        return res.status(503).json({ message: "Google Sheets integration is not configured" });
      }

      const user = req.user as any;
      const result = await exportCatalogToSheets(user.shopId);
      res.json(result);
    } catch (error: any) {
      console.error("Google Sheets export failed:", error);
      res.status(500).json({ message: error.message || "Failed to export catalog to Google Sheets" });
    }
  });

  // ==================== ORDERS ====================
  app.get("/api/orders", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const orders = await storage.getOrders(user.shopId);
      res.json(orders);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/orders", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const order = await storage.createOrder({
        ...req.body,
        shopId: user.shopId,
      });
      
      // Broadcast order creation event via WebSocket
      wsManager.broadcastToShop(user.shopId, {
        type: WS_EVENTS.ORDER_CREATED,
        data: order,
        timestamp: Date.now(),
      });
      
      res.json(order);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ==================== APPOINTMENTS ====================
  app.get("/api/appointments", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const appointments = await storage.getAppointments(user.shopId);
      res.json(appointments);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/appointments", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const { date, duration, serviceName, customerName, customerPhone } = req.body;

      // Check calendar availability
      const appointmentDate = new Date(date);
      const isAvailable = await checkAvailability(appointmentDate, duration);

      if (!isAvailable) {
        return res.status(400).json({ message: "This time slot is not available" });
      }

      // Create appointment in database
      const appointment = await storage.createAppointment({
        ...req.body,
        shopId: user.shopId,
      });

      // Sync to Google Calendar
      const calendarEventId = await createCalendarEvent(
        customerName,
        serviceName,
        appointmentDate,
        duration,
        customerPhone
      );

      if (calendarEventId) {
        console.log(`Appointment synced to Google Calendar: ${calendarEventId}`);
      }

      // Broadcast appointment creation event via WebSocket
      wsManager.broadcastToShop(user.shopId, {
        type: WS_EVENTS.APPOINTMENT_CREATED,
        data: appointment,
        timestamp: Date.now(),
      });

      res.json(appointment);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Get available time slots for a specific date
  app.get("/api/appointments/availability", requireAuth, async (req, res) => {
    try {
      const { date, duration } = req.query;
      
      if (!date || !duration) {
        return res.status(400).json({ message: "Date and duration are required" });
      }

      const appointmentDate = new Date(date as string);
      const durationMinutes = parseInt(duration as string);

      const availableSlots = await getAvailableSlots(appointmentDate, durationMinutes);
      
      res.json({
        date: appointmentDate,
        duration: durationMinutes,
        availableSlots: availableSlots.map(slot => slot.toISOString()),
      });
    } catch (error: any) {
      console.error('Error getting availability:', error);
      res.status(500).json({ message: error.message });
    }
  });

  // ==================== SUBSCRIPTIONS ====================
  app.get("/api/subscriptions/status", requireAuth, requireRole("owner"), async (req, res) => {
    try {
      const user = req.user as any;
      const shop = await storage.getShop(user.shopId);
      const subscription = await storage.getSubscription(user.shopId);

      res.json({
        plan: shop?.plan || "starter",
        status: shop?.status || "active",
        expiryDate: subscription?.expiryDate || null,
        shop: {
          name: shop?.name || "",
          status: shop?.status || "active",
        },
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/subscriptions/create-checkout", requireAuth, requireRole("owner"), async (req, res) => {
    try {
      if (!stripe) {
        return res.status(500).json({ message: "Stripe not configured" });
      }

      const user = req.user as any;
      const { plan } = req.body;
      const shop = await storage.getShop(user.shopId);

      if (!shop) {
        return res.status(404).json({ message: "Shop not found" });
      }

      // Price mapping (in cents)
      const priceMap: Record<string, number> = {
        starter: 2900, // $29
        pro: 5900,     // $59
        business: 9900, // $99
      };

      const amount = priceMap[plan] || 2900;

      // Create or get Stripe customer
      let customerId = shop.stripeCustomerId;
      if (!customerId) {
        const customer = await stripe.customers.create({
          email: shop.ownerEmail,
          name: shop.name,
          metadata: { shopId: shop.id.toString() },
        });
        customerId = customer.id;
        await storage.updateShop(shop.id, { stripeCustomerId: customerId });
      }

      // Create Stripe checkout session
      const session = await stripe.checkout.sessions.create({
        customer: customerId,
        payment_method_types: ['card'],
        line_items: [
          {
            price_data: {
              currency: 'usd',
              product_data: {
                name: `${plan.charAt(0).toUpperCase() + plan.slice(1)} Plan`,
                description: `Monthly subscription to ${plan} plan`,
              },
              recurring: {
                interval: 'month',
              },
              unit_amount: amount,
            },
            quantity: 1,
          },
        ],
        mode: 'subscription',
        success_url: `${req.headers.origin}/subscription?success=true`,
        cancel_url: `${req.headers.origin}/subscription?canceled=true`,
        metadata: {
          shopId: shop.id.toString(),
          plan,
        },
      });

      console.log(`[Stripe] Checkout session created: ${session.id}, URL: ${session.url}`);
      
      if (!session.url) {
        console.error('[Stripe] No checkout URL returned from Stripe');
        return res.status(500).json({ message: 'Failed to create checkout URL' });
      }

      res.json({ sessionId: session.id, url: session.url });
    } catch (error: any) {
      console.error('Stripe checkout error:', error);
      res.status(500).json({ message: error.message });
    }
  });

  // ==================== META GRAPH API WEBHOOKS ====================
  
  // Meta webhook verification endpoint (GET)
  app.get("/api/webhooks/meta", (req, res) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (!metaVerifyToken) {
      console.error('META_VERIFY_TOKEN not configured; unable to verify Meta webhook');
      return res.sendStatus(500);
    }

    if (mode === 'subscribe' && token === metaVerifyToken) {
      console.log('Meta webhook verified successfully');
      res.status(200).send(challenge);
    } else {
      console.error('Meta webhook verification failed');
      res.sendStatus(403);
    }
  });

  // Meta webhook message handler (POST)
  app.post("/api/webhooks/meta", async (req, res) => {
    try {
      // Verify webhook signature for security (REQUIRED if META_APP_SECRET is set)
      const signature = req.headers['x-hub-signature-256'];
      const appSecret = process.env.META_APP_SECRET;

      if (appSecret) {
        if (!signature) {
          console.error('Meta webhook signature missing');
          return res.sendStatus(403);
        }

        const rawBody = req.rawBody;
        if (!rawBody || !Buffer.isBuffer(rawBody)) {
          console.error('Meta webhook raw body unavailable for signature verification');
          return res.sendStatus(400);
        }

        const crypto = await import('crypto');
        const expectedSignature = 'sha256=' + crypto
          .createHmac('sha256', appSecret)
          .update(rawBody)
          .digest('hex');

        if (signature !== expectedSignature) {
          console.error('Meta webhook signature verification failed');
          return res.sendStatus(403);
        }
      }

      const body = req.body;
      
      // Handle webhook events
      if (body.object === 'page' || body.object === 'instagram' || body.object === 'whatsapp_business_account') {
        for (const entry of body.entry || []) {
          const sourceId = entry.id as string | undefined;

          // Handle WhatsApp messages
          if (entry.changes) {
            for (const change of entry.changes) {
              if (change.value?.messages && sourceId) {
                const shopId = resolveMetaShopId(sourceId);
                if (!shopId) {
                  console.error(`Meta webhook: unable to resolve shop for source ${sourceId}`);
                  continue;
                }

                for (const message of change.value.messages) {
                  const customerId = message.from || message.author;
                  const text = message.text?.body || message.text || '';

                  if (!customerId) {
                    continue;
                  }

                  await handleMetaMessage({
                    text,
                    platform: 'whatsapp',
                    customerId,
                    shopId,
                  });
                }
              }
            }
          }

          // Handle Messenger/Instagram messages
          if (entry.messaging) {
            for (const event of entry.messaging) {
              if (event.message) {
                const platform = body.object === 'instagram' ? 'instagram' : 'messenger';
                const customerId = event.sender?.id;
                const businessId = sourceId || event.recipient?.id;
                const text = event.message.text || '';

                if (!customerId || !businessId) {
                  continue;
                }

                const shopId = resolveMetaShopId(businessId);
                if (!shopId) {
                  console.error(`Meta webhook: unable to resolve shop for source ${businessId}`);
                  continue;
                }

                await handleMetaMessage({
                  text,
                  platform,
                  customerId,
                  shopId,
                });
              }
            }
          }
        }
      }

      res.sendStatus(200);
    } catch (error: any) {
      console.error('Meta webhook error:', error);
      res.sendStatus(500);
    }
  });

  // Helper function to handle Meta messages
  async function handleMetaMessage(payload: {
    text: string;
    platform: string;
    customerId: string;
    shopId: number;
  }) {
    try {
      const { text, platform, customerId, shopId } = payload;

      if (!text.trim()) {
        return;
      }

      let conversation = await storage.getConversationByCustomerId(customerId, shopId);

      if (!conversation) {
        conversation = await storage.createConversation({
          shopId,
          customerId,
          platform,
          status: 'active',
        });
      }

      await storage.createMessage({
        conversationId: conversation.id,
        role: 'user',
        content: text,
      });

      const [shop, productsList, servicesList, messageHistory] = await Promise.all([
        storage.getShop(shopId),
        storage.getProducts(shopId),
        storage.getServices(shopId),
        storage.getMessages(conversation.id),
      ]);

      const aiResponse = await generateAIResponse(text, {
        products: productsList,
        services: servicesList,
        businessType: (shop?.businessType as 'product' | 'service') || 'product',
        businessName: shop?.name || 'Our Business',
        conversationHistory: messageHistory.map((message) => ({
          role: message.role,
          content: message.content,
        })),
        conversationId: conversation.id.toString(),
      });

      await storage.createMessage({
        conversationId: conversation.id,
        role: 'assistant',
        content: aiResponse,
      });

      await storage.updateConversation(conversation.id, shopId, {
        lastMessageAt: new Date(),
      });

      await sendMetaMessage(customerId, aiResponse, platform);

      const intent = parseIntent(text);
      const lastUserMessages = messageHistory
        .filter((message) => message.role === 'user')
        .slice(-3)
        .map((message) => message.content)
        .join(' ');

      await maybeCreateOrderFromConversation({
        shopId,
        conversation,
        productsList,
        aiResponse,
        intent,
        recentUserMessages: lastUserMessages,
        platform,
      });
    } catch (error: any) {
      console.error('Error handling Meta message:', error);
    }
  }

  // Helper function to send messages through Meta Graph API
  async function sendMetaMessage(recipientId: string, message: string, platform: string) {
    try {
      const accessToken = process.env.META_ACCESS_TOKEN;
      
      if (!accessToken) {
        console.error('META_ACCESS_TOKEN not configured');
        return;
      }
      
      let url = '';
      let body: any = {};
      
      if (platform === 'whatsapp') {
        url = `https://graph.facebook.com/v18.0/me/messages?access_token=${accessToken}`;
        body = {
          messaging_product: 'whatsapp',
          to: recipientId,
          text: { body: message },
        };
      } else if (platform === 'messenger' || platform === 'instagram') {
        url = `https://graph.facebook.com/v18.0/me/messages?access_token=${accessToken}`;
        body = {
          recipient: { id: recipientId },
          message: { text: message },
        };
      }
      
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      
      if (!response.ok) {
        const error = await response.text();
        console.error('Failed to send Meta message:', error);
      }
    } catch (error: any) {
      console.error('Error sending Meta message:', error);
    }
  }

  // Stripe webhook handler
  app.post("/api/webhooks/stripe", async (req, res) => {
    if (!stripe) {
      return res.status(500).json({ message: "Stripe not configured" });
    }

    const signatureHeader = req.headers['stripe-signature'];
    const signature = Array.isArray(signatureHeader) ? signatureHeader[0] : signatureHeader;

    if (!signature) {
      return res.status(400).json({ message: "No signature" });
    }

    if (!stripeWebhookSecret) {
      console.error('STRIPE_WEBHOOK_SECRET not configured; rejecting webhook call');
      return res.status(500).json({ message: 'Webhook secret not configured' });
    }

    const rawBody = req.rawBody;
    if (!rawBody || !Buffer.isBuffer(rawBody)) {
      console.error('Unable to access raw request body for Stripe verification');
      return res.status(400).json({ message: 'Invalid webhook payload' });
    }

    let event: Stripe.Event;

    try {
      event = stripe.webhooks.constructEvent(rawBody, signature, stripeWebhookSecret);
    } catch (err: any) {
      console.error('Webhook signature verification failed:', err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    // Handle the event
    try {
      switch (event.type) {
        case 'checkout.session.completed': {
          const session = event.data.object as Stripe.Checkout.Session;
          const shopId = parseInt(session.metadata?.shopId || "0");
          const plan = session.metadata?.plan || "starter";
          
          if (shopId && session.subscription) {
            // Update shop with subscription ID and plan
            await storage.updateShop(shopId, {
              plan,
              status: "active",
              stripeSubscriptionId: session.subscription.toString(),
            });

            // Update or create subscription record
            const expiryDate = new Date();
            expiryDate.setMonth(expiryDate.getMonth() + 1);

            const existingSubscription = await storage.getSubscription(shopId);
            if (existingSubscription) {
              await storage.updateSubscription(shopId, {
                plan,
                status: "active",
                expiryDate,
              });
            } else {
              await storage.createSubscription({
                shopId,
                plan,
                status: "active",
                expiryDate,
              });
            }

            // Broadcast payment completion event via WebSocket
            wsManager.broadcastToShop(shopId, {
              type: WS_EVENTS.PAYMENT_COMPLETED,
              data: { plan, status: "active" },
              timestamp: Date.now(),
            });
          }
          break;
        }

        case 'customer.subscription.updated': {
          const subscription = event.data.object as Stripe.Subscription;
          const customer = await stripe.customers.retrieve(subscription.customer.toString());
          
          if (customer && !customer.deleted) {
            const shopId = parseInt(customer.metadata?.shopId || "0");
            if (shopId) {
              const status = subscription.status === 'active' ? 'active' : 'inactive';
              await storage.updateShop(shopId, { status });
              
              const existingSubscription = await storage.getSubscription(shopId);
              if (existingSubscription) {
                await storage.updateSubscription(shopId, { status });
              }
            }
          }
          break;
        }

        case 'customer.subscription.deleted': {
          const subscription = event.data.object as Stripe.Subscription;
          const customer = await stripe.customers.retrieve(subscription.customer.toString());
          
          if (customer && !customer.deleted) {
            const shopId = parseInt(customer.metadata?.shopId || "0");
            if (shopId) {
              await storage.updateShop(shopId, { 
                status: 'inactive',
                stripeSubscriptionId: null,
              });
              
              const existingSubscription = await storage.getSubscription(shopId);
              if (existingSubscription) {
                await storage.updateSubscription(shopId, { status: 'cancelled' });
              }
            }
          }
          break;
        }
      }

      res.json({ received: true });
    } catch (error: any) {
      console.error('Webhook handler error:', error);
      res.status(500).json({ message: error.message });
    }
  });

  // ==================== CONVERSATIONS & AI CHAT ====================
  app.get("/api/conversations", requireAuth, requireRole("owner", "order_manager"), async (req, res) => {
    try {
      const user = req.user as any;
      const conversations = await storage.getConversations(user.shopId);
      res.json(conversations);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/conversations", requireAuth, requireRole("owner", "order_manager"), async (req, res) => {
    try {
      const user = req.user as any;
      const conversation = await storage.createConversation({
        ...req.body,
        shopId: user.shopId,
      });
      res.json(conversation);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/conversations/:id/messages", requireAuth, async (req, res) => {
    try {
      const messages = await storage.getMessages(parseInt(req.params.id));
      res.json(messages);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/conversations/:id/messages", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const conversationId = parseInt(req.params.id);
      const { content } = req.body;

      // Get conversation to check if paused
      const conversation = await storage.getConversation(conversationId, user.shopId);
      if (!conversation) {
        return res.status(404).json({ message: "Conversation not found" });
      }

      if (conversation.pausedForHuman) {
        return res.status(400).json({ message: "Conversation is paused for human support" });
      }

      // Save user message
      const userMessage = await storage.createMessage({
        conversationId,
        role: "user",
        content,
      });

      // Broadcast message event via WebSocket
      wsManager.broadcastToShop(user.shopId, {
        type: WS_EVENTS.MESSAGE_RECEIVED,
        data: { conversationId, message: userMessage },
        timestamp: Date.now(),
      });

      // Check for human request
      const intent = parseIntent(content);
      if (intent.type === "human_request") {
        await storage.updateConversation(conversationId, user.shopId, {
          pausedForHuman: true,
          status: "paused",
        });

        const aiResponse = "I understand you'd like to speak with a human. Let me connect you with our team. Someone will contact you shortly.";
        await storage.createMessage({
          conversationId,
          role: "assistant",
          content: aiResponse,
        });

        await storage.updateConversation(conversationId, user.shopId, {
          lastMessageAt: new Date(),
        });

        return res.json({ message: "Conversation paused for human support" });
      }

      // Get shop and context for AI
      const shop = await storage.getShop(user.shopId);
      const productsList = await storage.getProducts(user.shopId);
      const servicesList = await storage.getServices(user.shopId);
      const messageHistory = await storage.getMessages(conversationId);

      // Generate AI response
      const aiResponse = await generateAIResponse(content, {
        products: productsList,
        services: servicesList,
        businessType: shop?.businessType as "product" | "service",
        businessName: shop?.name || "Our Business",
        conversationHistory: messageHistory.map(m => ({
          role: m.role,
          content: m.content,
        })),
        conversationId: conversationId.toString(),
      });

      // Save AI response
      await storage.createMessage({
        conversationId,
        role: "assistant",
        content: aiResponse,
      });

      // Check if we should create an order or appointment based on the FULL conversation
      const fullHistory = await storage.getMessages(conversationId);
      const lastUserMessages = fullHistory
        .filter(m => m.role === "user")
        .slice(-3)
        .map(m => m.content)
        .join(" ");

      await maybeCreateOrderFromConversation({
        shopId: user.shopId,
        conversation,
        productsList,
        aiResponse,
        intent,
        recentUserMessages: lastUserMessages,
        platform: conversation.platform,
      });

      // Update conversation timestamp
      await storage.updateConversation(conversationId, user.shopId, {
        lastMessageAt: new Date(),
      });

      res.json({ message: "Message sent successfully" });
    } catch (error: any) {
      console.error("Message error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  // ==================== DASHBOARD ANALYTICS ====================
  app.get("/api/dashboard/summary", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const userRole = user.role;

      // Get totals
      const [orderStats] = await db
        .select({
          totalRevenue: sql<number>`COALESCE(SUM(${orders.revenue}), 0)`,
          totalProfit: sql<number>`COALESCE(SUM(${orders.profit}), 0)`,
          totalOrders: sql<number>`COUNT(*)`,
        })
        .from(orders)
        .where(sql`${orders.shopId} = ${user.shopId}`);

      const [appointmentStats] = await db
        .select({
          totalAppointments: sql<number>`COUNT(*)`,
        })
        .from(appointments)
        .where(sql`${appointments.shopId} = ${user.shopId}`);

      // Get revenue data for chart (last 7 days)
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      const revenueData = await db
        .select({
          date: sql<string>`DATE(${orders.createdAt})`,
          revenue: sql<number>`SUM(${orders.revenue})`,
          profit: sql<number>`SUM(${orders.profit})`,
        })
        .from(orders)
        .where(sql`${orders.shopId} = ${user.shopId} AND ${orders.createdAt} >= ${sevenDaysAgo}`)
        .groupBy(sql`DATE(${orders.createdAt})`)
        .orderBy(sql`DATE(${orders.createdAt})`);

      // Get top products
      const topProducts = await db
        .select({
          name: orders.productName,
          revenue: sql<number>`SUM(${orders.revenue})`,
          quantity: sql<number>`SUM(${orders.quantity})`,
        })
        .from(orders)
        .where(sql`${orders.shopId} = ${user.shopId}`)
        .groupBy(orders.productName)
        .orderBy(sql`SUM(${orders.revenue}) DESC`)
        .limit(5);

      // Get top services
      const topServices = await db
        .select({
          name: appointments.serviceName,
          revenue: sql<number>`SUM(${appointments.price})`,
          count: sql<number>`COUNT(*)`,
        })
        .from(appointments)
        .where(sql`${appointments.shopId} = ${user.shopId}`)
        .groupBy(appointments.serviceName)
        .orderBy(sql`SUM(${appointments.price}) DESC`)
        .limit(5);

      // Filter data based on role
      const response: any = {
        totalRevenue: parseFloat(orderStats?.totalRevenue?.toString() || "0"),
        totalProfit: parseFloat(orderStats?.totalProfit?.toString() || "0"),
        totalOrders: parseInt(orderStats?.totalOrders?.toString() || "0"),
        totalAppointments: parseInt(appointmentStats?.totalAppointments?.toString() || "0"),
        revenueChange: 0,
        profitChange: 0,
        ordersChange: 0,
        appointmentsChange: 0,
      };

      // Accountant sees only financial data
      if (userRole === "accountant") {
        response.revenueData = revenueData.map(d => ({
          date: d.date,
          revenue: parseFloat(d.revenue?.toString() || "0"),
          profit: parseFloat(d.profit?.toString() || "0"),
        }));
        response.topProducts = topProducts.map(p => ({
          name: p.name,
          revenue: parseFloat(p.revenue?.toString() || "0"),
          quantity: parseInt(p.quantity?.toString() || "0"),
        }));
        response.topServices = topServices.map(s => ({
          name: s.name,
          revenue: parseFloat(s.revenue?.toString() || "0"),
          count: parseInt(s.count?.toString() || "0"),
        }));
      }
      
      // Order Manager sees operational data
      else if (userRole === "order_manager") {
        response.revenueData = [];
        response.topProducts = topProducts.map(p => ({
          name: p.name,
          quantity: parseInt(p.quantity?.toString() || "0"),
        }));
        response.topServices = topServices.map(s => ({
          name: s.name,
          count: parseInt(s.count?.toString() || "0"),
        }));
        // Hide profit data
        delete response.totalProfit;
        delete response.profitChange;
      }
      
      // Owner sees everything
      else {
        response.revenueData = revenueData.map(d => ({
          date: d.date,
          revenue: parseFloat(d.revenue?.toString() || "0"),
          profit: parseFloat(d.profit?.toString() || "0"),
        }));
        response.topProducts = topProducts.map(p => ({
          name: p.name,
          revenue: parseFloat(p.revenue?.toString() || "0"),
          quantity: parseInt(p.quantity?.toString() || "0"),
        }));
        response.topServices = topServices.map(s => ({
          name: s.name,
          revenue: parseFloat(s.revenue?.toString() || "0"),
          count: parseInt(s.count?.toString() || "0"),
        }));
      }

      res.json(response);
    } catch (error: any) {
      console.error("Dashboard error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  // ==================== HUMAN HANDOFF / SUPPORT QUEUE ====================
  app.get("/api/support/queue", requireAuth, requireRole("owner", "order_manager"), async (req, res) => {
    try {
      const user = req.user as any;
      const pausedConversations = await storage.getPausedConversations(user.shopId);
      res.json(pausedConversations);
    } catch (error: any) {
      console.error("Error fetching support queue:", error);
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/support/:conversationId/pause", requireAuth, requireRole("owner", "order_manager"), async (req, res) => {
    try {
      const user = req.user as any;
      const conversationId = parseInt(req.params.conversationId);
      
      const updated = await storage.pauseConversationForHuman(conversationId, user.shopId);
      
      // Send notification message to customer
      await storage.createMessage({
        conversationId,
        role: "assistant",
        content: "I've connected you with our support team. A human agent will be with you shortly.",
      });

      res.json(updated);
    } catch (error: any) {
      console.error("Error pausing conversation:", error);
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/support/:conversationId/resume", requireAuth, requireRole("owner", "order_manager"), async (req, res) => {
    try {
      const user = req.user as any;
      const conversationId = parseInt(req.params.conversationId);
      
      const updated = await storage.resumeConversation(conversationId, user.shopId);
      
      // Send notification message to customer
      await storage.createMessage({
        conversationId,
        role: "assistant",
        content: "Thank you for your patience. Our AI assistant is now ready to help you again. How can I assist you?",
      });

      res.json(updated);
    } catch (error: any) {
      console.error("Error resuming conversation:", error);
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/support/:conversationId/send-message", requireAuth, requireRole("owner", "order_manager"), async (req, res) => {
    try {
      const user = req.user as any;
      const conversationId = parseInt(req.params.conversationId);
      const { content } = req.body;

      // Verify conversation exists and is paused
      const conversation = await storage.getConversation(conversationId, user.shopId);
      if (!conversation) {
        return res.status(404).json({ message: "Conversation not found" });
      }

      if (!conversation.pausedForHuman) {
        return res.status(400).json({ message: "This conversation is not in human support mode" });
      }

      // Create message from human support
      const message = await storage.createMessage({
        conversationId,
        role: "assistant",
        content,
      });

      // Update last message timestamp
      await storage.updateConversation(conversationId, user.shopId, {
        lastMessageAt: new Date(),
      });

      // Broadcast message via WebSocket
      wsManager.broadcastToShop(user.shopId, {
        type: WS_EVENTS.MESSAGE_RECEIVED,
        data: { conversationId, message },
        timestamp: Date.now(),
      });

      res.json(message);
    } catch (error: any) {
      console.error("Error sending support message:", error);
      res.status(500).json({ message: error.message });
    }
  });

  // ==================== ADMIN - SUBSCRIPTION AUTOMATION ====================
  app.post("/api/admin/run-subscription-checks", requireAuth, requireRole("owner"), async (req, res) => {
    try {
      console.log('[Admin] Manual subscription check triggered');
      const result = await subscriptionAutomation.runDailyChecks();
      res.json({
        message: "Subscription checks completed successfully",
        result,
      });
    } catch (error: any) {
      console.error("[Admin] Error running subscription checks:", error);
      res.status(500).json({ message: error.message });
    }
  });

  const httpServer = createServer(app);

  return httpServer;
}
