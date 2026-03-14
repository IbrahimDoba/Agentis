import OpenAI from "openai"

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

export async function enhanceAgentInstructions(agentData: {
  businessName: string
  businessDescription: string
  productsServices: string
  faqs: string
  operatingHours: string
  responseGuidelines?: string
}): Promise<string> {
  const prompt = `You are an expert at crafting AI agent instructions for WhatsApp customer service bots.

Given the following business information, create clear, concise, and effective system instructions for a WhatsApp AI agent:

Business Name: ${agentData.businessName}
Business Description: ${agentData.businessDescription}
Products/Services: ${agentData.productsServices}
FAQs: ${agentData.faqs}
Operating Hours: ${agentData.operatingHours}
${agentData.responseGuidelines ? `Response Guidelines: ${agentData.responseGuidelines}` : ""}

Create professional agent instructions that will make the AI assistant helpful, friendly, and effective for customer service on WhatsApp. Include tone, how to handle common scenarios, and any specific guidelines.`

  const completion = await client.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: prompt }],
    max_tokens: 1000,
  })

  return completion.choices[0]?.message?.content ?? ""
}
