// From javascript_gemini blueprint - AI agent for customer conversations
import { GoogleGenAI } from "@google/genai";
import type { Product, Service } from "@shared/schema";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

interface ChatContext {
  products?: Product[];
  services?: Service[];
  businessType: "product" | "service";
  businessName: string;
  conversationHistory: Array<{ role: string; content: string }>;
}

export async function generateAIResponse(
  userMessage: string,
  context: ChatContext
): Promise<string> {
  try {
    const systemPrompt = buildSystemPrompt(context);
    
    // Build conversation history
    const conversationContent = context.conversationHistory.map(msg => 
      `${msg.role === "user" ? "Customer" : "Assistant"}: ${msg.content}`
    ).join("\n");

    const fullPrompt = `${systemPrompt}\n\nConversation History:\n${conversationContent}\n\nCustomer: ${userMessage}\nAssistant:`;

    const response = await ai.models.generateContent({
      model: "gemini-2.0-flash-exp",
      contents: fullPrompt,
    });

    return response.text || "I apologize, I'm having trouble responding right now. Please try again.";
  } catch (error) {
    console.error("AI generation error:", error);
    return "I apologize, I'm experiencing technical difficulties. A human agent will assist you shortly.";
  }
}

function buildSystemPrompt(context: ChatContext): string {
  const { businessType, businessName, products, services } = context;

  let basePrompt = `You are an AI customer service agent for ${businessName}. You are helpful, friendly, and professional.

Your role:
1. Answer customer questions about products/services
2. Help customers place orders or book appointments
3. Provide accurate information about pricing and availability
4. Be concise but complete in your responses
5. If a customer asks for a human or mentions "support" or "help from person", respond with: "I understand you'd like to speak with a human. Let me connect you with our team. Someone will contact you shortly."

`;

  if (businessType === "product" && products && products.length > 0) {
    basePrompt += `\nAvailable Products:\n`;
    products.forEach(p => {
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
    services.forEach(s => {
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

// Parse AI response to detect order/appointment intent
export function parseIntent(message: string): {
  type: "order" | "appointment" | "human_request" | "general";
  data?: any;
} {
  const lowerMessage = message.toLowerCase();

  // Check for human request keywords
  if (
    lowerMessage.includes("human") ||
    lowerMessage.includes("support") ||
    lowerMessage.includes("talk to someone") ||
    lowerMessage.includes("speak with person")
  ) {
    return { type: "human_request" };
  }

  // Check for order keywords
  if (
    lowerMessage.includes("order") ||
    lowerMessage.includes("buy") ||
    lowerMessage.includes("purchase")
  ) {
    return { type: "order" };
  }

  // Check for appointment keywords
  if (
    lowerMessage.includes("book") ||
    lowerMessage.includes("appointment") ||
    lowerMessage.includes("schedule") ||
    lowerMessage.includes("reserve")
  ) {
    return { type: "appointment" };
  }

  return { type: "general" };
}
