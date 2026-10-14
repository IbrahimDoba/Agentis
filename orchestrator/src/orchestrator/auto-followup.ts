import { sql } from "../db/client.js"
import { getOrchestratorAgent } from "../db/queries/agents.js"
import { insertMessage, humanIntervenedSince } from "../db/queries/conversations.js"
import { buildSystemPrompt, buildMessages } from "./context-builder.js"
import { loadConversationMemory } from "./conversation-memory.js"
import { dispatchReply, canAffordReply } from "./response-dispatcher.js"
import { resolveProvider } from "../providers/registry.js"
import { publishSseEvent } from "../lib/sse-publish.js"
import { sanitizeWhatsAppFormatting, sanitizeWhatsAppLinks } from "./handle-inbound.js"
import { stripImageUrls } from "../lib/strip-image-urls.js"
import { detachUrlPunctuation } from "../lib/detach-url-punctuation.js"
import { withinSendWindow, hourInLagos, capPerAgent, buildFollowUpInstruction } from "./auto-followup-rules.js"
import { logger as rootLogger } from "../lib/logger.js"

const logger = rootLogger.child({ module: "auto-followup" })

const SWEEP_INTERVAL_MS = 5 * 60 * 1000
// Only lulls younger than this qualify. Without the ceiling, flipping the
// feature on would follow up every silent thread the agent has ever had.
const MAX_LULL_HOURS = 48
const PER_AGENT_CAP = 5
const SWEEP_LIMIT = 50

interface FollowUpCandidate {
  conversationId: string
  agentId: string
  senderJid: string | null
  phoneNumber: string
  lastMessageAt: string
  afterMinutes: number
  instructions: string | null
}

// Conversations where the AI spoke last, the customer has been silent past the
// agent's threshold, and this lull hasn't been followed up yet. The EXISTS guard
// is what prevents chaining: a follow-up is itself an outbound AI message, so
// without requiring a NEW inbound after lastFollowedUpAt, each follow-up would
// re-qualify the conversation N hours later, forever.
async function findCandidates(): Promise<FollowUpCandidate[]> {
  return sql<FollowUpCandidate[]>`
    SELECT c."id" AS "conversationId", c."agentId", c."senderJid", c."phoneNumber",
           last_msg."createdAt" AS "lastMessageAt",
           a."autoFollowUpAfterMinutes" AS "afterMinutes",
           a."autoFollowUpInstructions" AS "instructions"
    FROM "Conversation" c
    JOIN "Agent" a ON a."id" = c."agentId"
    JOIN LATERAL (
      SELECT m."direction", m."senderRole", m."createdAt"
      FROM "Message" m
      WHERE m."conversationId" = c."id"
      ORDER BY m."createdAt" DESC
      LIMIT 1
    ) last_msg ON TRUE
    WHERE a."autoFollowUpEnabled" = TRUE
      AND a."autoFollowUpAfterMinutes" IS NOT NULL
      AND a."autoFollowUpAfterMinutes" > 0
      AND a."aiRepliesEnabled" IS DISTINCT FROM FALSE
      AND c."mode" = 'ai'
      AND c."channel" = 'whatsapp'
      AND c."deletedAt" IS NULL
      AND last_msg."direction" = 'outbound'
      AND last_msg."senderRole" = 'ai'
      AND last_msg."createdAt" < NOW() - (a."autoFollowUpAfterMinutes" * INTERVAL '1 minute')
      AND last_msg."createdAt" > NOW() - ${MAX_LULL_HOURS} * INTERVAL '1 hour'
      AND (
        c."lastFollowedUpAt" IS NULL
        OR EXISTS (
          SELECT 1 FROM "Message" mi
          WHERE mi."conversationId" = c."id"
            AND mi."direction" = 'inbound'
            AND mi."createdAt" > c."lastFollowedUpAt"
        )
      )
    ORDER BY last_msg."createdAt" ASC
    LIMIT ${SWEEP_LIMIT}
  `
}

// Atomically claim this lull's one follow-up. Concurrent sweeps (or a second
// orchestrator instance) both select the candidate, but the row lock serialises
// the UPDATEs and only the first passes the WHERE — the loser skips. A claim
// is kept even when the send later fails: silently retrying an unsolicited
// message every sweep is worse than missing one nudge.
async function claimFollowUp(conversationId: string, lastMessageAt: string): Promise<boolean> {
  const rows = await sql<{ id: string }[]>`
    UPDATE "Conversation"
    SET "lastFollowedUpAt" = NOW()
    WHERE "id" = ${conversationId}
      AND ("lastFollowedUpAt" IS NULL OR "lastFollowedUpAt" < ${lastMessageAt})
    RETURNING "id"
  `
  return rows.length > 0
}

async function hasInboundSince(conversationId: string, since: string): Promise<boolean> {
  const rows = await sql<{ exists: boolean }[]>`
    SELECT EXISTS(
      SELECT 1 FROM "Message"
      WHERE "conversationId" = ${conversationId}
        AND "direction" = 'inbound'
        AND "createdAt" > ${since}
    ) AS "exists"
  `
  return rows[0]?.exists === true
}

async function processCandidate(c: FollowUpCandidate): Promise<void> {
  if (!(await claimFollowUp(c.conversationId, c.lastMessageAt))) return

  // Same pre-LLM gates as a normal reply: don't burn tokens for an account that
  // can't send, and never follow up a chat a human has taken over or the
  // customer has already revived between the sweep SELECT and now.
  if (!(await canAffordReply(c.agentId))) {
    logger.info({ agentId: c.agentId, conversationId: c.conversationId }, "Auto follow-up skipped — out of credits")
    return
  }
  if (await humanIntervenedSince(c.conversationId, new Date(c.lastMessageAt))) return
  if (await hasInboundSince(c.conversationId, c.lastMessageAt)) return

  const agent = await getOrchestratorAgent(c.agentId)
  if (!agent || !agent.isActive) return

  const hoursSilent = (Date.now() - new Date(c.lastMessageAt).getTime()) / 3_600_000

  let memory: string | null = null
  try {
    memory = (await loadConversationMemory(c.conversationId))?.summary ?? null
  } catch (err: any) {
    logger.warn({ conversationId: c.conversationId, err: err?.message }, "Memory load failed — following up without it")
  }
  const systemPrompt =
    (await buildSystemPrompt(agent, "Africa/Lagos", undefined, null, memory)) +
    buildFollowUpInstruction(hoursSilent, c.instructions)
  const messages = await buildMessages(c.conversationId, agent.shortTermWindow)

  // Plain completion, no tools: a follow-up is one short nudge. Letting the
  // tool loop run here could re-send catalogues/albums into a silent chat.
  const result = await resolveProvider(agent.model).chat({
    model: agent.model,
    system: systemPrompt,
    messages,
    temperature: agent.temperature,
    max_output_tokens: agent.maxOutputTokens,
  })

  const text = detachUrlPunctuation(
    sanitizeWhatsAppLinks(sanitizeWhatsAppFormatting(stripImageUrls(result.content ?? "")))
  ).trim()
  if (!text) {
    logger.warn({ agentId: c.agentId, conversationId: c.conversationId }, "Auto follow-up LLM returned empty — skipping")
    return
  }

  // The LLM turn takes seconds — re-check both races before persisting.
  if (await humanIntervenedSince(c.conversationId, new Date(c.lastMessageAt))) return
  if (await hasInboundSince(c.conversationId, c.lastMessageAt)) return

  const messageId = await insertMessage({
    conversationId: c.conversationId,
    direction: "outbound",
    content: text,
    tokensInput: result.usage.input_tokens,
    tokensOutput: result.usage.output_tokens,
    modelUsed: agent.model,
  })

  await publishSseEvent(c.agentId, "message", {
    conversationId: c.conversationId,
    direction: "outbound",
  })

  // senderJid is the raw chat JID (LID-safe); the digits fallback covers rows
  // from before senderJid existed.
  const toJid = c.senderJid ?? `${c.phoneNumber.replace(/\D/g, "")}@s.whatsapp.net`
  try {
    await dispatchReply({
      agentId: c.agentId,
      conversationId: c.conversationId,
      toJid,
      text,
      source: "ai",
      messageId,
      tokensInput: result.usage.input_tokens,
      tokensOutput: result.usage.output_tokens,
      channel: "whatsapp",
    })
  } catch (err) {
    // Same contract as the worker's own abort path: never leave a Message row
    // the customer never received.
    await sql`DELETE FROM "Message" WHERE "id" = ${messageId}`.catch(() => {})
    throw err
  }

  logger.info(
    { agentId: c.agentId, conversationId: c.conversationId, hoursSilent: Math.round(hoursSilent * 10) / 10 },
    "Auto follow-up sent"
  )
}

export async function runAutoFollowUpSweep(now = new Date()): Promise<void> {
  if (!withinSendWindow(hourInLagos(now))) return

  const candidates = capPerAgent(await findCandidates(), PER_AGENT_CAP)
  if (candidates.length === 0) return
  logger.info({ count: candidates.length }, "Auto follow-up sweep — processing candidates")

  // Sequential on purpose: the per-candidate LLM call is the slow part, and a
  // gentle drip is the point of the feature. One failure must not stop the rest.
  for (const candidate of candidates) {
    try {
      await processCandidate(candidate)
    } catch (err: any) {
      logger.error(
        { agentId: candidate.agentId, conversationId: candidate.conversationId, err: err?.message },
        "Auto follow-up failed for conversation"
      )
    }
  }
}

let sweepTimer: NodeJS.Timeout | null = null
let sweeping = false

export function startAutoFollowUpSweep(): void {
  // No immediate run: let the service settle after boot, and avoid a thundering
  // first sweep on every redeploy.
  sweepTimer = setInterval(() => {
    if (sweeping) return // a slow sweep must not stack a second one
    sweeping = true
    runAutoFollowUpSweep()
      .catch((err) => logger.error({ err: err?.message }, "Auto follow-up sweep crashed"))
      .finally(() => {
        sweeping = false
      })
  }, SWEEP_INTERVAL_MS)
  sweepTimer.unref()
  logger.info({ intervalMs: SWEEP_INTERVAL_MS }, "Auto follow-up sweep started")
}

export function stopAutoFollowUpSweep(): void {
  if (sweepTimer) clearInterval(sweepTimer)
  sweepTimer = null
}
