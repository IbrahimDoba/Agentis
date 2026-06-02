import OpenAI from "openai"
import { db } from "@/lib/db"

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

// PrismaNeon adapter sometimes returns JSONB columns as raw strings instead
// of parsed objects (driver path dependent). Tolerate both shapes wherever
// we read autoConfigInputs / autoConfigDraft.
export function parseJsonbColumn<T>(raw: unknown): T | null {
  if (raw === null || raw === undefined) return null
  if (typeof raw === "string") {
    try { return JSON.parse(raw) as T } catch { return null }
  }
  if (typeof raw === "object") return raw as T
  return null
}

// The LLM call that turns the chat-extractor's normalized dataset + the
// agent's WhatsApp profile into a complete agent draft (system prompt,
// products, FAQs, etc.) the user reviews and accepts on /onboarding/review.

export interface CandidateMessage {
  direction: "inbound" | "outbound"
  content: string
  ts: string
}

export interface ConversationCandidate {
  contactPhone: string
  contactName: string | null
  hadOperatorReply: boolean
  lastMessages: CandidateMessage[]
}

export interface AutoConfigInputsBlob {
  candidates: ConversationCandidate[]
  extractedAt: string
}

export interface AutoConfigDraft {
  systemPrompt: string
  description: string
  personality: string
  products: { name: string; priceRange: string; notes: string }[]
  faqs: { question: string; answer: string }[]
  insights: string[]
}

const SYSTEM_INSTRUCTION = `You are an expert at analyzing WhatsApp business conversations and configuring AI customer service agents based on them.

You'll receive (1) a business profile (name, category, description, address) and (2) recent 1:1 WhatsApp conversations between the business and its customers. Your job is to produce a COMPLETE configuration for an AI agent that should be able to handle 80% of future customer messages on its own, in the same tone and with the same product knowledge the operator already uses.

Output rules:
- Return STRICT JSON matching the provided schema. No prose outside the JSON.
- All strings are plain text (no markdown, no emojis unless they appear in customer chats).
- systemPrompt: a complete agent system prompt the AI will use as-is. Should reference the business name, what they sell, tone, working hours if implied by the chats, and special policies you observed (delivery zones, payment methods, etc.). 200-600 words.
- description: 1-3 sentence external-facing business description.
- personality: 1-2 sentence note on the operator's tone (e.g. "Warm and helpful, often greets customers with 'Welcome dear', uses Nigerian English including Pidgin phrases").
- products: extract the products/services the operator sold or quoted. Use the OPERATOR's actual prices when stated. priceRange like "₦15,000 – ₦40,000" or "₦5,000". notes: brief context.
- faqs: extract recurring questions and the operator's actual answers. 4-10 entries. Re-phrase to be generic (don't include customer names).
- insights: 3-6 short bullets the operator will find useful (response patterns, common complaints, peak chat times if obvious, etc.).

If the conversations are too sparse to extract a particular section, return [] for products / faqs and a generic but honest systemPrompt — never invent products or prices that weren't in the chats.`

const RESPONSE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["systemPrompt", "description", "personality", "products", "faqs", "insights"],
  properties: {
    systemPrompt: { type: "string" },
    description: { type: "string" },
    personality: { type: "string" },
    products: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "priceRange", "notes"],
        properties: {
          name: { type: "string" },
          priceRange: { type: "string" },
          notes: { type: "string" },
        },
      },
    },
    faqs: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["question", "answer"],
        properties: {
          question: { type: "string" },
          answer: { type: "string" },
        },
      },
    },
    insights: { type: "array", items: { type: "string" } },
  },
} as const

interface AgentProfileSnapshot {
  businessName: string
  description: string | null
  category: string | null
  address: string | null
  contactEmail: string | null
  websiteLinks: string | null
}

// Generates the draft and writes it to Agent.autoConfigDraft. Throws on
// LLM failures so the caller can surface the error.
export async function generateAutoConfigDraft(agentId: string): Promise<AutoConfigDraft> {
  const rows = await db.agent.findUnique({
    where: { id: agentId },
    select: {
      businessName: true,
      businessDescription: true,
      category: true,
      address: true,
      contactEmail: true,
      websiteLinks: true,
      autoConfigInputs: true,
      autoConfigStatus: true,
    },
  })
  if (!rows) throw new Error("Agent not found")
  if (rows.autoConfigStatus === "skipped") {
    throw new Error("Auto-configure was skipped")
  }
  if (!rows.autoConfigInputs) {
    throw new Error("No autoConfigInputs on this agent — run chat extraction first")
  }

  const inputs = parseJsonbColumn<AutoConfigInputsBlob>(rows.autoConfigInputs)
  if (!inputs) {
    throw new Error(`autoConfigInputs could not be parsed (raw type: ${typeof rows.autoConfigInputs})`)
  }
  if (!inputs.candidates || inputs.candidates.length === 0) {
    throw new Error("autoConfigInputs has no candidates")
  }

  const profile: AgentProfileSnapshot = {
    businessName: rows.businessName,
    description: rows.businessDescription || null,
    category: rows.category,
    address: rows.address,
    contactEmail: rows.contactEmail,
    websiteLinks: rows.websiteLinks,
  }

  // Mark analyzing so polling UIs can show the right stage.
  await db.agent.update({
    where: { id: agentId },
    data: { autoConfigStatus: "analyzing" },
  })

  const userMessage = buildUserPrompt(profile, inputs.candidates)

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: SYSTEM_INSTRUCTION },
      { role: "user", content: userMessage },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "AutoConfigDraft",
        strict: true,
        schema: RESPONSE_SCHEMA,
      },
    },
    temperature: 0.4,
    max_tokens: 2500,
  })

  const text = completion.choices[0]?.message?.content ?? ""
  let draft: AutoConfigDraft
  try {
    draft = JSON.parse(text) as AutoConfigDraft
  } catch {
    throw new Error("LLM returned invalid JSON")
  }

  const latest = await db.agent.findUnique({
    where: { id: agentId },
    select: { autoConfigStatus: true },
  })
  if (latest?.autoConfigStatus === "skipped") {
    throw new Error("Auto-configure was skipped")
  }

  // Persist the draft + flip status to ready_for_review so the
  // /onboarding/review page knows to render it.
  await db.agent.update({
    where: { id: agentId },
    data: {
      autoConfigDraft: draft as unknown as object,
      autoConfigStatus: "ready_for_review",
      autoConfigCompletedAt: new Date(),
    },
  })

  return draft
}

function buildUserPrompt(profile: AgentProfileSnapshot, candidates: ConversationCandidate[]): string {
  const profileLines = [
    `Business name: ${profile.businessName}`,
    profile.category && `Category: ${profile.category}`,
    profile.address && `Address: ${profile.address}`,
    profile.description && `Existing description: ${profile.description}`,
    profile.contactEmail && `Email: ${profile.contactEmail}`,
    profile.websiteLinks && `Website(s): ${profile.websiteLinks}`,
  ]
    .filter(Boolean)
    .join("\n")

  const chatBlocks = candidates
    .map((c, i) => {
      const transcript = c.lastMessages
        .map((m) => {
          const who = m.direction === "inbound" ? "CUSTOMER" : "OPERATOR"
          return `${who}: ${m.content.replace(/\s+/g, " ").slice(0, 400)}`
        })
        .join("\n")
      const label = c.contactName ? `${c.contactName} (${c.contactPhone})` : c.contactPhone
      return `## Conversation ${i + 1} — ${label}\n${transcript}`
    })
    .join("\n\n")

  return `# Business profile\n${profileLines || "(no profile fields available)"}\n\n# Recent conversations (${candidates.length})\n\n${chatBlocks}\n\n---\nUsing the profile + conversations above, produce the agent configuration JSON described in the system instructions.`
}

// Activate: copy the draft fields into the live Agent columns the
// orchestrator + dashboard read from. Called when the user clicks "Activate
// my AI agent" on /onboarding/review.
export async function activateAutoConfigDraft(agentId: string): Promise<void> {
  const agent = await db.agent.findUnique({
    where: { id: agentId },
    select: { autoConfigDraft: true, businessName: true, businessDescription: true, responseGuidelines: true },
  })
  if (!agent || !agent.autoConfigDraft) throw new Error("No draft to activate")
  const draft = parseJsonbColumn<AutoConfigDraft>(agent.autoConfigDraft)
  if (!draft) throw new Error("autoConfigDraft could not be parsed")

  // Build the productsData JSON from the draft's products list. Existing
  // schema stores productsData as Product[] with id/name/description fields.
  const productsData = draft.products.map((p, i) => ({
    id: `auto-${i}-${Date.now()}`,
    name: p.name,
    description: [p.priceRange, p.notes].filter(Boolean).join(" — "),
  }))

  // FAQs go into a free-form section we append to the system prompt /
  // responseGuidelines, since there's no first-class FAQ field on Agent.
  const faqSection = draft.faqs.length
    ? `\n\n## FAQs\n${draft.faqs.map((f) => `Q: ${f.question}\nA: ${f.answer}`).join("\n\n")}`
    : ""
  const combinedGuidelines = `${draft.systemPrompt}\n\n## Personality\n${draft.personality}${faqSection}`.trim()

  await db.agent.update({
    where: { id: agentId },
    data: {
      // Only fill businessDescription if still empty (don't clobber dashboard edits)
      businessDescription: agent.businessDescription || draft.description,
      responseGuidelines: combinedGuidelines,
      productsData: productsData as unknown as object,
      autoConfigStatus: "activated",
    },
  })
}
