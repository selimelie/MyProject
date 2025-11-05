import {
  type User,
  type InsertUser,
  type Shop,
  type InsertShop,
  type Product,
  type InsertProduct,
  type Service,
  type InsertService,
  type Order,
  type InsertOrder,
  type Appointment,
  type InsertAppointment,
  type Subscription,
  type InsertSubscription,
  type Conversation,
  type InsertConversation,
  type Message,
  type InsertMessage,
  users,
  shops,
  products,
  services,
  orders,
  appointments,
  subscriptions,
  conversations,
  messages,
} from "@shared/schema";
import { db } from "./db";
import { eq, and, desc, sql } from "drizzle-orm";

export interface IStorage {
  // Users
  getUser(id: number): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  getUserWithShop(id: number): Promise<(User & { shop: Shop }) | undefined>;
  createUser(user: InsertUser): Promise<User>;

  // Shops
  getShop(id: number): Promise<Shop | undefined>;
  getShopByEmail(email: string): Promise<Shop | undefined>;
  createShop(shop: InsertShop): Promise<Shop>;
  updateShop(id: number, data: Partial<InsertShop>): Promise<Shop>;

  // Products
  getProducts(shopId: number): Promise<Product[]>;
  getProduct(id: number, shopId: number): Promise<Product | undefined>;
  createProduct(product: InsertProduct): Promise<Product>;
  updateProduct(id: number, shopId: number, data: Partial<InsertProduct>): Promise<Product>;
  deleteProduct(id: number, shopId: number): Promise<void>;

  // Services
  getServices(shopId: number): Promise<Service[]>;
  getService(id: number, shopId: number): Promise<Service | undefined>;
  createService(service: InsertService): Promise<Service>;
  updateService(id: number, shopId: number, data: Partial<InsertService>): Promise<Service>;
  deleteService(id: number, shopId: number): Promise<void>;

  // Orders
  getOrders(shopId: number): Promise<Order[]>;
  getOrder(id: number, shopId: number): Promise<Order | undefined>;
  createOrder(order: InsertOrder): Promise<Order>;
  updateOrder(id: number, shopId: number, data: Partial<InsertOrder>): Promise<Order>;

  // Appointments
  getAppointments(shopId: number): Promise<Appointment[]>;
  getAppointment(id: number, shopId: number): Promise<Appointment | undefined>;
  createAppointment(appointment: InsertAppointment): Promise<Appointment>;
  updateAppointment(id: number, shopId: number, data: Partial<InsertAppointment>): Promise<Appointment>;

  // Subscriptions
  getSubscription(shopId: number): Promise<Subscription | undefined>;
  createSubscription(subscription: InsertSubscription): Promise<Subscription>;
  updateSubscription(shopId: number, data: Partial<InsertSubscription>): Promise<Subscription>;

  // Conversations
  getConversations(shopId: number): Promise<Conversation[]>;
  getConversation(id: number, shopId: number): Promise<Conversation | undefined>;
  getConversationByCustomerId(customerId: string, shopId: number): Promise<Conversation | undefined>;
  getPausedConversations(shopId: number): Promise<Conversation[]>;
  createConversation(conversation: InsertConversation): Promise<Conversation>;
  updateConversation(id: number, shopId: number, data: Partial<InsertConversation>): Promise<Conversation>;
  pauseConversationForHuman(id: number, shopId: number): Promise<Conversation>;
  resumeConversation(id: number, shopId: number): Promise<Conversation>;

  // Messages
  getMessages(conversationId: number): Promise<Message[]>;
  createMessage(message: InsertMessage): Promise<Message>;
}

export class DatabaseStorage implements IStorage {
  // Users
  async getUser(id: number): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || undefined;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user || undefined;
  }

  async getUserWithShop(id: number): Promise<(User & { shop: Shop }) | undefined> {
    const result = await db
      .select()
      .from(users)
      .leftJoin(shops, eq(users.shopId, shops.id))
      .where(eq(users.id, id));

    if (!result[0] || !result[0].shops) return undefined;

    return {
      ...result[0].users,
      shop: result[0].shops,
    };
  }

  async createUser(user: InsertUser): Promise<User> {
    const [created] = await db.insert(users).values(user).returning();
    return created;
  }

  // Shops
  async getShop(id: number): Promise<Shop | undefined> {
    const [shop] = await db.select().from(shops).where(eq(shops.id, id));
    return shop || undefined;
  }

  async getShopByEmail(email: string): Promise<Shop | undefined> {
    const [shop] = await db.select().from(shops).where(eq(shops.ownerEmail, email));
    return shop || undefined;
  }

  async createShop(shop: InsertShop): Promise<Shop> {
    const [created] = await db.insert(shops).values(shop).returning();
    return created;
  }

  async updateShop(id: number, data: Partial<InsertShop>): Promise<Shop> {
    const [updated] = await db.update(shops).set(data).where(eq(shops.id, id)).returning();
    return updated;
  }

  // Products
  async getProducts(shopId: number): Promise<Product[]> {
    return db.select().from(products).where(eq(products.shopId, shopId)).orderBy(desc(products.createdAt));
  }

  async getProduct(id: number, shopId: number): Promise<Product | undefined> {
    const [product] = await db
      .select()
      .from(products)
      .where(and(eq(products.id, id), eq(products.shopId, shopId)));
    return product || undefined;
  }

  async createProduct(product: InsertProduct): Promise<Product> {
    const [created] = await db.insert(products).values(product).returning();
    return created;
  }

  async updateProduct(id: number, shopId: number, data: Partial<InsertProduct>): Promise<Product> {
    const [updated] = await db
      .update(products)
      .set(data)
      .where(and(eq(products.id, id), eq(products.shopId, shopId)))
      .returning();
    return updated;
  }

  async deleteProduct(id: number, shopId: number): Promise<void> {
    await db.delete(products).where(and(eq(products.id, id), eq(products.shopId, shopId)));
  }

  // Services
  async getServices(shopId: number): Promise<Service[]> {
    return db.select().from(services).where(eq(services.shopId, shopId)).orderBy(desc(services.createdAt));
  }

  async getService(id: number, shopId: number): Promise<Service | undefined> {
    const [service] = await db
      .select()
      .from(services)
      .where(and(eq(services.id, id), eq(services.shopId, shopId)));
    return service || undefined;
  }

  async createService(service: InsertService): Promise<Service> {
    const [created] = await db.insert(services).values(service).returning();
    return created;
  }

  async updateService(id: number, shopId: number, data: Partial<InsertService>): Promise<Service> {
    const [updated] = await db
      .update(services)
      .set(data)
      .where(and(eq(services.id, id), eq(services.shopId, shopId)))
      .returning();
    return updated;
  }

  async deleteService(id: number, shopId: number): Promise<void> {
    await db.delete(services).where(and(eq(services.id, id), eq(services.shopId, shopId)));
  }

  // Orders
  async getOrders(shopId: number): Promise<Order[]> {
    return db.select().from(orders).where(eq(orders.shopId, shopId)).orderBy(desc(orders.createdAt));
  }

  async getOrder(id: number, shopId: number): Promise<Order | undefined> {
    const [order] = await db
      .select()
      .from(orders)
      .where(and(eq(orders.id, id), eq(orders.shopId, shopId)));
    return order || undefined;
  }

  async createOrder(order: InsertOrder): Promise<Order> {
    const [created] = await db.insert(orders).values(order).returning();
    return created;
  }

  async updateOrder(id: number, shopId: number, data: Partial<InsertOrder>): Promise<Order> {
    const [updated] = await db
      .update(orders)
      .set(data)
      .where(and(eq(orders.id, id), eq(orders.shopId, shopId)))
      .returning();
    return updated;
  }

  // Appointments
  async getAppointments(shopId: number): Promise<Appointment[]> {
    return db
      .select()
      .from(appointments)
      .where(eq(appointments.shopId, shopId))
      .orderBy(desc(appointments.createdAt));
  }

  async getAppointment(id: number, shopId: number): Promise<Appointment | undefined> {
    const [appointment] = await db
      .select()
      .from(appointments)
      .where(and(eq(appointments.id, id), eq(appointments.shopId, shopId)));
    return appointment || undefined;
  }

  async createAppointment(appointment: InsertAppointment): Promise<Appointment> {
    const [created] = await db.insert(appointments).values(appointment).returning();
    return created;
  }

  async updateAppointment(id: number, shopId: number, data: Partial<InsertAppointment>): Promise<Appointment> {
    const [updated] = await db
      .update(appointments)
      .set(data)
      .where(and(eq(appointments.id, id), eq(appointments.shopId, shopId)))
      .returning();
    return updated;
  }

  // Subscriptions
  async getSubscription(shopId: number): Promise<Subscription | undefined> {
    const [subscription] = await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.shopId, shopId));
    return subscription || undefined;
  }

  async createSubscription(subscription: InsertSubscription): Promise<Subscription> {
    const [created] = await db.insert(subscriptions).values(subscription).returning();
    return created;
  }

  async updateSubscription(shopId: number, data: Partial<InsertSubscription>): Promise<Subscription> {
    const [updated] = await db
      .update(subscriptions)
      .set(data)
      .where(eq(subscriptions.shopId, shopId))
      .returning();
    return updated;
  }

  // Conversations
  async getConversations(shopId: number): Promise<Conversation[]> {
    return db
      .select()
      .from(conversations)
      .where(eq(conversations.shopId, shopId))
      .orderBy(desc(conversations.lastMessageAt));
  }

  async getConversation(id: number, shopId: number): Promise<Conversation | undefined> {
    const [conversation] = await db
      .select()
      .from(conversations)
      .where(and(eq(conversations.id, id), eq(conversations.shopId, shopId)));
    return conversation || undefined;
  }

  async getConversationByCustomerId(customerId: string, shopId: number): Promise<Conversation | undefined> {
    const [conversation] = await db
      .select()
      .from(conversations)
      .where(and(eq(conversations.customerId, customerId), eq(conversations.shopId, shopId)))
      .orderBy(sql`${conversations.id} DESC`)
      .limit(1);
    return conversation || undefined;
  }

  async createConversation(conversation: InsertConversation): Promise<Conversation> {
    const [created] = await db.insert(conversations).values(conversation).returning();
    return created;
  }

  async updateConversation(id: number, shopId: number, data: Partial<InsertConversation>): Promise<Conversation> {
    const [updated] = await db
      .update(conversations)
      .set(data)
      .where(and(eq(conversations.id, id), eq(conversations.shopId, shopId)))
      .returning();
    return updated;
  }

  async getPausedConversations(shopId: number): Promise<Conversation[]> {
    return db
      .select()
      .from(conversations)
      .where(and(eq(conversations.shopId, shopId), eq(conversations.pausedForHuman, true)))
      .orderBy(sql`${conversations.lastMessageAt} DESC`);
  }

  async pauseConversationForHuman(id: number, shopId: number): Promise<Conversation> {
    const [updated] = await db
      .update(conversations)
      .set({
        pausedForHuman: true,
        status: "paused",
      })
      .where(and(eq(conversations.id, id), eq(conversations.shopId, shopId)))
      .returning();
    return updated;
  }

  async resumeConversation(id: number, shopId: number): Promise<Conversation> {
    const [updated] = await db
      .update(conversations)
      .set({
        pausedForHuman: false,
        status: "active",
      })
      .where(and(eq(conversations.id, id), eq(conversations.shopId, shopId)))
      .returning();
    return updated;
  }

  // Messages
  async getMessages(conversationId: number): Promise<Message[]> {
    return db
      .select()
      .from(messages)
      .where(eq(messages.conversationId, conversationId))
      .orderBy(messages.createdAt);
  }

  async createMessage(message: InsertMessage): Promise<Message> {
    const [created] = await db.insert(messages).values(message).returning();
    return created;
  }
}

export const storage = new DatabaseStorage();
