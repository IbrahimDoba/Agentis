import OpenAI from "openai"

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

// Cheap + fast, matching the rest of the app's ancillary LLM calls
// (src/lib/openai.ts). Overridable so the demo can showcase a stronger model.
const MODEL = process.env.META_TEST_OPENAI_MODEL || "gpt-4o-mini"

// The subset of Agent fields the harness turns into a system prompt. Kept as a
// plain shape (not the Prisma type) so this stays a pure, testable helper.
export interface AgentPersona {
  businessName: string
  businessDescription: string
  productsServices: string
  faqs: string
  operatingHours: string
  contactEmail?: string | null
  contactPhone?: string | null
  websiteLinks?: string | null
  responseGuidelines?: string | null
}

export interface HistoryTurn {
  direction: "inbound" | "outbound"
  text: string
}

function buildSystemPrompt(agent: AgentPersona): string {
  const sections = [
    `You are the WhatsApp customer-service assistant for "${agent.businessName}". Reply as the business, in a warm, concise, conversational tone suited to WhatsApp — short paragraphs, no markdown headings.`,
    `## About the business\n${agent.businessDescription}`,
    `## Products & services\n${agent.productsServices}`,
    `## FAQs\n${agent.faqs}`,
    `## Operating hours\n${agent.operatingHours}`,
  ]

  const contact = [
    agent.contactEmail && `Email: ${agent.contactEmail}`,
    agent.contactPhone && `Phone: ${agent.contactPhone}`,
    agent.websiteLinks && `Links: ${agent.websiteLinks}`,
  ].filter(Boolean)
  if (contact.length) sections.push(`## Contact\n${contact.join("\n")}`)

  // Guidelines authored for the main pipeline can carry {{customer_context}}-style
  // placeholders it substitutes; the harness has no substitution step, so strip
  // them rather than feeding the model a literal "{{customer_context}}".
  const guidelines = agent.responseGuidelines?.replace(/\{\{\s*\w+\s*\}\}/g, "").trim()
  if (guidelines) {
    sections.push(`## Response guidelines\n${guidelines}`)
  }

  sections.push(
    `Only answer from the information above. If you don't know something, say you'll check and offer to connect them with a human — never invent prices, stock, or policies.`
  )
  return sections.join("\n\n")
}

// Generate the assistant's reply to the latest customer message, given prior
// turns for context. `history` should already be trimmed to a sane window and
// ordered oldest→newest, EXCLUDING the just-received message (passed as `userText`).
export async function generateAgentReply(
  agent: AgentPersona,
  history: HistoryTurn[],
  userText: string
): Promise<string> {
  const completion = await openai.chat.completions.create({
    model: MODEL,
    messages: [
      { role: "system", content: buildSystemPrompt(agent) },
      ...history.map((t) => ({
        role: t.direction === "inbound" ? ("user" as const) : ("assistant" as const),
        content: t.text,
      })),
      { role: "user", content: userText },
    ],
    max_tokens: 500,
  })

  return (
    completion.choices[0]?.message?.content?.trim() ||
    "Sorry, I didn't quite catch that — could you rephrase?"
  )
}
