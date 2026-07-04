import OpenAI from "openai"
import { db } from "@/lib/db"

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

interface ScanOptions {
  agentId: string
  campaignId: string
  minDaysSince: number
  // "Message everyone": skip the AI's needed/not-needed judgment and generate a
  // personalized re-engagement message for EVERY eligible contact, for the
  // operator to review and pick from.
  includeAll?: boolean
}

interface ClassifyResult {
  needed: boolean
  reason: string
  message: string
}

const BATCH_CONCURRENCY = 10
// Safety bound on one scan (not truly unlimited — an unbounded scan of every
// conversation could rack up OpenAI cost + take a long time). Covers the
// up-to-2000 range; raise if needed.
const MAX_CONVERSATIONS = 2000
const FOLLOW_UP_COOLDOWN_DAYS = 7

async function classifyAndGenerate(
  messages: { direction: string; content: string; createdAt: Date }[],
  contactName: string | null,
  businessDescription: string,
  daysSinceLastMessage: number,
  includeAll: boolean
): Promise<ClassifyResult | null> {
  const transcript = messages
    .slice(-14)
    .map((m) => `${m.direction === "inbound" ? "Customer" : "Agent"}: ${m.content}`)
    .join("\n")

  const prompt = `You are analyzing a WhatsApp business conversation to decide if a follow-up message is needed.

Business: ${businessDescription}
Contact: ${contactName ?? "Unknown"}
Days since last customer message: ${daysSinceLastMessage}

Conversation (most recent):
${transcript}

Decide if this customer needs a follow-up. Follow-up IS needed if:
- Customer showed interest, asked about a product/service/price but the conversation ended without resolution
- Customer started a booking or inquiry but didn't complete it
- There was an unresolved question or issue

Follow-up is NOT needed if:
- Customer said goodbye, thanks, or indicated they're done
- Customer's issue was fully resolved
- Customer explicitly said they'll come back later
- The conversation was spam or irrelevant

If follow-up IS needed, write a short, natural, personalized WhatsApp message (1-2 sentences max).
- Use the contact's first name if available
- Reference what they were asking about specifically
- Be helpful, not pushy
- Sound like a real human, not a bot

Respond ONLY with valid JSON: {"needed": true/false, "reason": "one sentence why", "message": "the follow-up message or empty string if not needed"}`

  // "Message everyone" mode: skip the needed/not-needed judgment — ALWAYS write a
  // warm, personalized re-engagement message. The operator reviews and decides.
  const reengagePrompt = `You are writing a short, warm, personalized WhatsApp follow-up to re-engage a past customer of a business. ALWAYS write a message.

Business: ${businessDescription}
Contact: ${contactName ?? "Unknown"}
Days since last customer message: ${daysSinceLastMessage}

Conversation (most recent):
${transcript}

Write a message that:
- References what they were interested in / asked about specifically
- Uses the contact's first name if available
- Gently invites them to continue or come back — helpful and friendly, NOT pushy
- Is 1-2 sentences, sounds like a real human, not a bot

Respond ONLY with valid JSON: {"reason": "one sentence context", "message": "the follow-up message"}`

  try {
    const res = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: includeAll ? reengagePrompt : prompt }],
      response_format: { type: "json_object" },
      temperature: includeAll ? 0.6 : 0.4,
      max_tokens: 300,
    })
    const raw = res.choices[0]?.message?.content
    if (!raw) return null
    const parsed = JSON.parse(raw) as ClassifyResult
    if (includeAll) {
      // Always a follow-up here, as long as the model produced a message.
      if (!parsed.message?.trim()) return null
      return { needed: true, reason: parsed.reason ?? "", message: parsed.message }
    }
    if (typeof parsed.needed !== "boolean") return null
    return parsed
  } catch {
    return null
  }
}

async function runBatch<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = []
  for (let i = 0; i < items.length; i += concurrency) {
    const batch = items.slice(i, i + concurrency)
    const batchResults = await Promise.all(batch.map(fn))
    results.push(...batchResults)
  }
  return results
}

export async function runFollowUpScan(opts: ScanOptions): Promise<{
  scanned: number
  found: number
}> {
  const { agentId, campaignId, minDaysSince, includeAll = false } = opts

  // Get the agent's business description for context
  const agent = await db.agent.findUnique({
    where: { id: agentId },
    select: { businessDescription: true, businessName: true },
  })
  const businessDescription = `${agent?.businessName ?? "Business"}: ${agent?.businessDescription ?? "A WhatsApp business"}`

  const cutoff = new Date(Date.now() - minDaysSince * 24 * 60 * 60 * 1000)
  const cooldownCutoff = new Date(Date.now() - FOLLOW_UP_COOLDOWN_DAYS * 24 * 60 * 60 * 1000)
  const now = new Date()

  // Fetch eligible conversations
  const conversations = await db.conversation.findMany({
    where: {
      agentId,
      mode: "ai", // not in human handoff
      // Last activity was more than minDaysSince ago (went cold)
      lastActivityAt: { lte: cutoff },
      // Not followed up recently
      OR: [
        { lastFollowedUpAt: null },
        { lastFollowedUpAt: { lte: cooldownCutoff } },
      ],
    },
    select: {
      id: true,
      phoneNumber: true,
      contactName: true,
      lastActivityAt: true,
      messages: {
        orderBy: { createdAt: "desc" },
        take: 14,
        select: { direction: true, content: true, createdAt: true },
      },
    },
    orderBy: { lastActivityAt: "desc" },
    take: MAX_CONVERSATIONS,
  })

  // Filter: must have at least one inbound message
  const eligible = conversations.filter((c) =>
    c.messages.some((m) => m.direction === "inbound")
  )

  // Update totalScanned on the campaign
  await db.followUpCampaign.update({
    where: { id: campaignId },
    data: { totalScanned: eligible.length },
  })

  if (eligible.length === 0) {
    await db.followUpCampaign.update({
      where: { id: campaignId },
      data: { status: "review", totalFound: 0 },
    })
    return { scanned: 0, found: 0 }
  }

  // Run AI classification in batches
  const results = await runBatch(eligible, BATCH_CONCURRENCY, async (conv) => {
    const daysSince = conv.lastActivityAt
      ? Math.floor((now.getTime() - new Date(conv.lastActivityAt).getTime()) / (1000 * 60 * 60 * 24))
      : 999

    const orderedMessages = [...conv.messages].reverse()
    const result = await classifyAndGenerate(
      orderedMessages,
      conv.contactName,
      businessDescription,
      daysSince,
      includeAll
    )

    return { conv, result }
  })

  // Save found messages to DB
  let found = 0
  for (const { conv, result } of results) {
    if (!result?.needed || !result.message) continue

    const digits = conv.phoneNumber.replace(/\D/g, "")
    const jid = `${digits}@s.whatsapp.net`

    await db.followUpMessage.create({
      data: {
        campaignId,
        conversationId: conv.id,
        phoneNumber: conv.phoneNumber,
        jid,
        contactName: conv.contactName,
        aiReason: result.reason,
        generatedMessage: result.message,
        status: "pending",
      },
    })
    found++
  }

  await db.followUpCampaign.update({
    where: { id: campaignId },
    data: {
      totalFound: found,
      status: "review",
    },
  })

  return { scanned: eligible.length, found }
}
