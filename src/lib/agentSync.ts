import OpenAI from "openai"
import { updateAgentPrompt } from "@/lib/elevenlabs"
import type { Product } from "@/types"

function getOpenAI() {
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
}

interface AgentData {
  businessName: string
  businessDescription: string
  productsServices: string
  faqs: string
  operatingHours: string
  contactEmail?: string | null
  contactPhone?: string | null
  websiteLinks?: string | null
  responseGuidelines?: string | null
  category?: string | null
  address?: string | null
  productsData?: Product[] | null
}

function buildRawContext(agent: AgentData): string {
  const lines: string[] = []

  lines.push(`Business Name: ${agent.businessName}`)
  if (agent.category) lines.push(`Category: ${agent.category}`)
  if (agent.address) lines.push(`Address: ${agent.address}`)
  lines.push(`\nDescription:\n${agent.businessDescription}`)
  lines.push(`\nProducts & Services:\n${agent.productsServices}`)

  if (agent.productsData && agent.productsData.length > 0) {
    lines.push(`\nProduct Catalogue:`)
    agent.productsData.forEach((p) => {
      lines.push(`- ${p.name}${p.price ? ` — ${p.price}` : ""}${p.description ? `: ${p.description}` : ""}${p.link ? ` (${p.link})` : ""}`)
    })
  }

  lines.push(`\nFAQs:\n${agent.faqs}`)
  lines.push(`\nOperating Hours: ${agent.operatingHours}`)

  if (agent.contactEmail) lines.push(`Contact Email: ${agent.contactEmail}`)
  if (agent.contactPhone) lines.push(`Contact Phone: ${agent.contactPhone}`)
  if (agent.websiteLinks) lines.push(`Website: ${agent.websiteLinks}`)

  if (agent.responseGuidelines) {
    lines.push(`\nResponse Guidelines:\n${agent.responseGuidelines}`)
  }

  return lines.join("\n")
}

export async function buildAndSyncElevenLabsPrompt(
  elevenlabsAgentId: string,
  agent: AgentData
): Promise<void> {
  const openai = getOpenAI()
  const rawContext = buildRawContext(agent)

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.3,
    messages: [
      {
        role: "system",
        content: `You are an expert at writing system prompts for WhatsApp AI agents powered by ElevenLabs Conversational AI.

Your task is to take raw business information and produce a clean, well-structured system prompt in proper markdown that will be used as the ElevenLabs agent's instructions.

Follow these rules:
- Start with a clear role definition: who the agent is and what business it represents
- Use markdown headers (##) to organise sections
- Keep the tone professional but friendly and conversational — this is a WhatsApp voice/text agent
- Include all relevant business details in a way the AI can reference naturally in conversation
- For products, format them clearly so the agent can answer pricing and availability questions
- For FAQs, present them so the agent can answer naturally without sounding scripted
- End with a "Behaviour & Tone" section based on the response guidelines (or sensible defaults if none provided)
- Do NOT include placeholder text or instructions to "fill in later"
- Do NOT wrap the output in a code block — return the raw markdown only
- ALWAYS include the following customer memory block exactly as written at the very top of the prompt, before anything else:

## Customer Memory
{{#if is_returning_customer}}
You are speaking with {{customer_name}}. Here is context from their previous conversations with this business:
{{customer_memory}}

Greet them warmly by name and acknowledge they are a returning customer. Reference relevant past interactions naturally where appropriate.
{{else}}
This is a new customer. Greet them warmly. If their name comes up naturally in conversation, remember it.
{{/if}}`,
      },
      {
        role: "user",
        content: `Here is the raw business data. Generate the ElevenLabs system prompt:\n\n${rawContext}`,
      },
    ],
  })

  const systemPrompt = completion.choices[0]?.message?.content
  if (!systemPrompt) throw new Error("OpenAI returned empty response")

  await updateAgentPrompt(elevenlabsAgentId, systemPrompt)
}
