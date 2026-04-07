import OpenAI from "openai"

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

export async function enhanceAgentInstructions(data: {
  businessName: string
  systemPrompt?: string
}): Promise<string> {
  const hasExisting = data.systemPrompt && data.systemPrompt.trim().length > 0

  const prompt = hasExisting
    ? `You are an expert at writing system prompts for WhatsApp AI agents.

The user has written the following system prompt for their business "${data.businessName}". Improve and expand it — make it clearer, more structured, and more effective for a WhatsApp customer service agent. Keep all their original information but make it professional and comprehensive.

Current prompt:
${data.systemPrompt}

Return only the improved system prompt with no explanation or wrapper text.`
    : `You are an expert at writing system prompts for WhatsApp AI agents.

Generate a professional, comprehensive system prompt for a WhatsApp AI customer service agent for a business called "${data.businessName || "this business"}".

The prompt should include:
- A clear role definition (who the agent is and what business it represents)
- Tone and personality guidelines (friendly, professional, conversational)
- How to handle common scenarios (greetings, product questions, complaints, escalation)
- Placeholder sections the user can fill in: business description, services, FAQs, operating hours

Return only the system prompt with no explanation or wrapper text.`

  const completion = await client.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: prompt }],
    max_tokens: 1200,
  })

  return completion.choices[0]?.message?.content ?? ""
}
