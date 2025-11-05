import { GoogleGenAI } from "@google/genai";
import type { Product, Service } from "@shared/schema";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
if (!GEMINI_API_KEY) {
  throw new Error("GEMINI_API_KEY must be configured before using AI features.");
}

const GEMINI_MODEL = process.env.GEMINI_MODEL?.trim() || "gemini-2.0-flash-exp";
const AI_MAX_RETRIES = 3;
const AI_RETRY_BASE_DELAY_MS = 500;
const AI_MIN_INTERVAL_MS = Number(process.env.AI_MIN_INTERVAL_MS ?? 1500);
const AI_CONVERSATION_CACHE_LIMIT = 1000;

const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
const conversationRateLimit = new Map<string, number>();

interface ChatHistoryEntry {
  role: string;
  content: string;
}

interface ChatContext {
  products?: Product[];
  services?: Service[];
  businessType: "product" | "service";
  businessName: string;
  conversationHistory?: ChatHistoryEntry[];
  conversationId?: string;
}

const englishHumanKeywords = ["human", "support", "talk to someone", "speak with person", "agent", "human agent"];
const englishOrderKeywords = ["order", "buy", "purchase"];
const englishAppointmentKeywords = ["book", "appointment", "schedule", "reserve", "reservation"];

const arabicHumanKeywords = ["بشري", "انسان", "شخص", "موظف", "ممثل", "دعم", "خدمة", "مساعدة"];
const arabicOrderKeywords = ["طلب", "أطلب", "اشتري", "شراء", "اريد طلب", "اريد شراء"];
const arabicAppointmentKeywords = ["حجز", "احجز", "موعد", "جدول", "اريد موعد", "احدد موعد"];

function containsArabic(text: string): boolean {
  return /[\u0600-\u06FF]/.test(text);
}

function trimHistory(history: ChatHistoryEntry[]): ChatHistoryEntry[] {
  return history.slice(-10);
}

async function delay(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function pruneConversationRateLimit(now: number): void {
  if (conversationRateLimit.size <= AI_CONVERSATION_CACHE_LIMIT) {
    return;
  }

  for (const [conversationId, timestamp] of conversationRateLimit.entries()) {
    if (now - timestamp > AI_MIN_INTERVAL_MS * 10) {
      conversationRateLimit.delete(conversationId);
    }
  }
}

async function callModelWithRetry(prompt: string, attempt = 1): Promise<string> {
  try {
    const result = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: [{ role: "user", parts: [{ text: prompt }] }],
    });

    const maybeResponse = (result as any).response;
    if (maybeResponse && typeof maybeResponse.text === "function") {
      return maybeResponse.text();
    }

    if (typeof (result as any).text === "function") {
      return (result as any).text();
    }

    return (
      maybeResponse?.candidates?.[0]?.content?.parts?.[0]?.text ??
      ((typeof (result as any).text === "string" && (result as any).text) || "")
    );
  } catch (error) {
    if (attempt >= AI_MAX_RETRIES) {
      throw error;
    }

    const backoff = AI_RETRY_BASE_DELAY_MS * Math.pow(2, attempt - 1);
    await delay(backoff);
    return callModelWithRetry(prompt, attempt + 1);
  }
}

export async function generateAIResponse(
  userMessage: string,
  context: ChatContext
): Promise<string> {
  const history = trimHistory(context.conversationHistory ?? []);
  const now = Date.now();

  if (context.conversationId) {
    const lastInvocation = conversationRateLimit.get(context.conversationId);
    if (lastInvocation && now - lastInvocation < AI_MIN_INTERVAL_MS) {
      await delay(AI_MIN_INTERVAL_MS - (now - lastInvocation));
    }
  }

  const languagePrefersArabic = containsArabic(userMessage) || history.some((entry) => containsArabic(entry.content));
  const languageDirective = languagePrefersArabic
    ? "Respond in Modern Standard Arabic. Keep the tone friendly and professional."
    : "Respond in English with a friendly, professional tone. If the customer writes in Arabic, seamlessly switch to Modern Standard Arabic.";

  const systemPrompt = buildSystemPrompt(context, languageDirective);

  const conversationTranscript = history
    .map((msg) => `${msg.role === "user" ? "Customer" : "Assistant"}: ${msg.content}`)
    .join("\n");

  const fullPrompt = `${systemPrompt}\n\nConversation History:\n${conversationTranscript}\n\nCustomer: ${userMessage}\nAssistant:`;

  try {
    const aiText = await callModelWithRetry(fullPrompt);
    const responseText =
      aiText?.trim() || "I apologize, I'm having trouble responding right now. Please try again.";

    if (context.conversationId) {
      conversationRateLimit.set(context.conversationId, Date.now());
      pruneConversationRateLimit(Date.now());
    }

    return responseText;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[AI] generation error:", message);
    return "I apologize, I'm experiencing technical difficulties. A human agent will assist you shortly.";
  }
}

function buildSystemPrompt(context: ChatContext, languageDirective: string): string {
  const { businessType, businessName, products, services } = context;

  let basePrompt = `You are an AI customer service agent for ${businessName}. You are helpful, friendly, and professional.

Your role:
1. Answer customer questions about products/services
2. Help customers place orders or book appointments
3. Provide accurate information about pricing and availability
4. Be concise but complete in your responses
5. If a customer asks for a human or mentions "support" or "help from person", respond with: "I understand you'd like to speak with a human. Let me connect you with our team. Someone will contact you shortly."
6. Never invent unavailable products, services, or discounts. Ask clarifying questions when information is missing.

Language instructions: ${languageDirective}
`;

  if (businessType === "product" && products && products.length > 0) {
    basePrompt += `\nAvailable Products:\n`;
    products.forEach((p) => {
      if (p.active) {
        basePrompt += `- ${p.name}: $${p.price} (Stock: ${p.stock} units)\n`;
        if (p.description) basePrompt += `  ${p.description}\n`;
      }
    });
    basePrompt += `\nWhen a customer wants to order:
1. Confirm the product and quantity
2. Check stock availability
3. Ask for their name and contact information
4. Confirm the total price
5. Tell them their order is being processed`;
  }

  if (businessType === "service" && services && services.length > 0) {
    basePrompt += `\nAvailable Services:\n`;
    services.forEach((s) => {
      if (s.active) {
        basePrompt += `- ${s.name}: $${s.price} (Duration: ${s.duration} minutes)\n`;
        if (s.description) basePrompt += `  ${s.description}\n`;
      }
    });
    basePrompt += `\nWhen a customer wants to book:
1. Confirm the service
2. Ask for their preferred date and time
3. Ask for their name and contact information
4. Confirm the appointment details
5. Tell them their appointment is being scheduled`;
  }

  return basePrompt;
}

export function parseIntent(message: string): {
  type: "order" | "appointment" | "human_request" | "general";
  data?: any;
} {
  const normalized = message.toLowerCase();

  const includesKeyword = (keywords: string[]) => keywords.some((keyword) => normalized.includes(keyword));

  if (includesKeyword(englishHumanKeywords) || includesKeyword(arabicHumanKeywords)) {
    return { type: "human_request" };
  }

  if (includesKeyword(englishOrderKeywords) || includesKeyword(arabicOrderKeywords)) {
    return { type: "order" };
  }

  if (includesKeyword(englishAppointmentKeywords) || includesKeyword(arabicAppointmentKeywords)) {
    return { type: "appointment" };
  }

  return { type: "general" };
}
