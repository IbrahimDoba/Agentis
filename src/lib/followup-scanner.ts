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
  // Restrict the scan to chats carrying this WhatsApp label (waLabelId), e.g.
  // only "warm leads". Undefined = all eligible conversations.
  targetLabelId?: string
}

interface ClassifyResult {
  needed: boolean
  reason: string
  message: string
}

const BATCH_CONCURRENCY = 10
// Overall time budget for the LLM scan. Kept safely under the route's
// maxDuration so the scan always finalizes to "review" (with whatever it
// processed) instead of being hard-killed mid-run and left stuck on "scanning".
const SCAN_DEADLINE_MS = 240_000
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


export async function runFollowUpScan(opts: ScanOptions): Promise<{
  scanned: number
  found: number
}> {
  const { agentId, campaignId, minDaysSince, includeAll = false, targetLabelId } = opts

  // Label targeting: restrict to chats tagged with this label. We match on BOTH
  // the resolved phone AND the raw chat JID (bridged via Conversation.senderJid)
  // so LID-keyed labels still join — phone alone misses most of them.
  let labelPhones: string[] | null = null
  let labelJids: string[] | null = null
  if (targetLabelId) {
    const tagged = await db.chatLabel.findMany({
      where: { agentId, waLabelId: targetLabelId },
      select: { phoneNumber: true, chatJid: true },
    })
    labelPhones = tagged.map((t) => t.phoneNumber).filter((p): p is string => !!p)
    labelJids = tagged.map((t) => t.chatJid).filter((j): j is string => !!j)
    // No chats carry the label → nothing to scan.
    if (labelPhones.length === 0 && labelJids.length === 0) {
      await db.followUpCampaign.update({
        where: { id: campaignId },
        data: { status: "review", totalScanned: 0, totalFound: 0 },
      })
      return { scanned: 0, found: 0 }
    }
  }

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
      // Never follow up into a group. The AI only speaks in groups when tagged;
      // an unprompted "just checking in" to 40 people is the unsolicited-send
      // pattern that gets numbers banned.
      channel: { not: "whatsapp_group" },
      // Last activity was more than minDaysSince ago (went cold)
      lastActivityAt: { lte: cutoff },
      AND: [
        // Not followed up recently
        { OR: [{ lastFollowedUpAt: null }, { lastFollowedUpAt: { lte: cooldownCutoff } }] },
        // Label targeting: chats carrying the selected label (by phone OR chat JID).
        ...(targetLabelId
          ? [{ OR: [{ phoneNumber: { in: labelPhones ?? [] } }, { senderJid: { in: labelJids ?? [] } }] }]
          : []),
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

  // totalScanned is updated incrementally by the scan loop below (so progress
  // climbs); no pre-loop write here, which would otherwise jump the counter.

  if (eligible.length === 0) {
    await db.followUpCampaign.update({
      where: { id: campaignId },
      data: { status: "review", totalFound: 0 },
    })
    return { scanned: 0, found: 0 }
  }

  // Run AI classification in batches, SAVING INCREMENTALLY and under an overall
  // time budget. A large agent (thousands of cold chats) used to blow past the
  // serverless limit and leave the campaign stuck on "scanning" forever; now the
  // scan always finalizes to "review" with whatever it processed in the window,
  // and each batch's results are persisted as they complete (so nothing is lost
  // if the function is killed near the end).
  const deadline = Date.now() + SCAN_DEADLINE_MS
  let found = 0
  let processed = 0

  for (let i = 0; i < eligible.length; i += BATCH_CONCURRENCY) {
    if (Date.now() > deadline) {
      console.warn(`[followup-scan] time budget hit — finalizing after ${processed}/${eligible.length} conversations`)
      break
    }

    // Stop early if the operator cancelled the campaign mid-scan (cheap PK read).
    const current = await db.followUpCampaign.findUnique({ where: { id: campaignId }, select: { status: true } })
    if (current?.status !== "scanning") {
      console.warn("[followup-scan] campaign no longer scanning (cancelled) — stopping")
      return { scanned: processed, found }
    }

    const batch = eligible.slice(i, i + BATCH_CONCURRENCY)
    const batchResults = await Promise.all(
      batch.map(async (conv) => {
        try {
          const daysSince = conv.lastActivityAt
            ? Math.floor((now.getTime() - new Date(conv.lastActivityAt).getTime()) / (1000 * 60 * 60 * 24))
            : 999
          const orderedMessages = [...conv.messages].reverse()
          const result = await classifyAndGenerate(orderedMessages, conv.contactName, businessDescription, daysSince, includeAll)
          return { conv, result }
        } catch (err) {
          // One conversation's LLM failure must not sink the whole batch.
          console.error("[followup-scan] classify error:", (err as Error)?.message)
          return { conv, result: null as ClassifyResult | null }
        }
      })
    )
    processed += batch.length

    for (const { conv, result } of batchResults) {
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
      }).catch((err) => console.error("[followup-scan] save error:", err?.message))
      found++
    }

    // Keep the UI's progress counters moving batch-by-batch.
    await db.followUpCampaign
      .update({ where: { id: campaignId }, data: { totalScanned: processed, totalFound: found } })
      .catch(() => {})
  }

  // Finalize to "review" ONLY if still scanning — never clobber a cancel that
  // landed while this background run was finishing.
  await db.followUpCampaign.updateMany({
    where: { id: campaignId, status: "scanning" },
    data: { totalScanned: processed, totalFound: found, status: "review" },
  })

  return { scanned: processed, found }
}
