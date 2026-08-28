import { getOrchestratorAgent, isAiRepliesPaused, isReplyGuardEnabled, getReplyDelayMs, type OrchestratorAgent } from "../db/queries/agents.js"
import {
  getOrCreateConversation,
  getConversationById,
  insertMessage,
  setConversationAdContextIfEmpty,
  getConversationMessageCount,
  humanIntervenedSince,
  type AdContext,
  type Conversation,
} from "../db/queries/conversations.js"
import { buildSystemPrompt, buildMessages } from "./context-builder.js"
import { dispatchReply, chargeEmbedTurn, canAffordReply } from "./response-dispatcher.js"
import { buildRichContent } from "./rich-content.js"
import { publishSseEvent } from "../lib/sse-publish.js"
import { uploadFile } from "../storage/r2.js"
import { stripImageUrls } from "../lib/strip-image-urls.js"
import { detachUrlPunctuation } from "../lib/detach-url-punctuation.js"
import { runAgentTurn } from "./run-agent-turn.js"
import { guardReply } from "./reply-guard.js"
import { isChatTaggingEnabled, chatHasAiDisabledLabel } from "../db/queries/labels.js"
import { getGroupChat, linkGroupConversation } from "../db/queries/groups.js"
import { classifyAndTagInBackground } from "./background-tagger.js"
import { getRedis } from "../queue/redis.js"
import { inboundQueue } from "../queue/queues.js"
import { logger as rootLogger } from "../lib/logger.js"

const logger = rootLogger.child({ module: "handle-inbound" })

// "whatsapp_group" behaves like whatsapp for transport but differs on the
// 1:1-only steps (tagging, operator handoff). Use isWhatsApp() for "goes out
// over Baileys" and an explicit === comparison for group-specific behaviour.
export type Channel = "whatsapp" | "embed" | "whatsapp_group"
const isWhatsApp = (c: Channel) => c === "whatsapp" || c === "whatsapp_group"

export interface InboundPayload {
  agentId: string
  messageId: string
  fromPhone: string
  senderJid: string
  text: string
  timestamp: number
  pushName?: string
  adContext?: AdContext
  // Embed-widget transport. When "embed", the orchestrator skips Baileys
  // dispatch and just persists the outbound reply — the visitor's widget
  // picks it up via polling.
  channel?: Channel
  visitorId?: string
  // Group only: the group JID (also the conversation key) and the participant
  // who spoke.
  groupJid?: string
  senderName?: string
  // Inbound image (data URL or https) for vision — attached to this turn only.
  imageDataUrl?: string
}

// Payload of the delayed "reply" job. Enqueued once per inbound message when the
// agent has a reply delay set; a per-conversation sequence token lets all but
// the last message in a burst bow out, so the surviving job produces ONE reply
// built from the whole (now-complete) history — i.e. rapid messages coalesce.
export interface ReplyJobPayload {
  conversationId: string
  agentId: string
  senderJid: string
  channel: Channel
  latestText: string
  imageDataUrl?: string
  inboundSavedAt: string // ISO — anchor for the human-interjection check
  seq: number
  groupJid?: string
  senderName?: string
  triggerMessageId?: string
}

const seqKey = (conversationId: string) => `debounce:seq:${conversationId}`

// Everything generateReply needs that isn't on the agent/conversation.
interface ReplyContext {
  senderJid: string
  channel: Channel
  latestText: string
  imageDataUrl?: string
  inboundSavedAt: Date
  groupJid?: string
  senderName?: string
  // The group message that tagged us. Dispatch quotes it — in a busy group an
  // unquoted reply landing several messages later answers nobody visibly.
  triggerMessageId?: string
}

/**
 * Ingest an inbound message: persist it, notify the dashboard, then either reply
 * now or — when the agent has a reply delay configured — schedule a debounced
 * reply so rapid messages batch into one. Called by the inbound BullMQ worker
 * (job name "inbound") after dedup.
 */
// Persist an inbound WhatsApp image to R2 and return its object key (mediaUrl
// stores the key, not a URL — the private bucket is signed on view by the
// dashboard). Returns null for non-images or a malformed data URL.
async function storeConversationImage(agentId: string, messageId: string, dataUrl: string): Promise<string | null> {
  const m = dataUrl.match(/^data:([^;]+);base64,([\s\S]+)$/)
  if (!m) return null
  const mime = m[1]
  if (!mime.startsWith("image/")) return null
  const buffer = Buffer.from(m[2], "base64")
  const ext = (mime.split("/")[1] || "jpg").split("+")[0]
  const key = `conversation-media/${agentId}/${messageId}.${ext}`
  await uploadFile(key, buffer, mime)
  return key
}

export async function handleInbound(payload: InboundPayload): Promise<void> {
  const { agentId, fromPhone, senderJid, text, pushName, adContext: incomingAdContext } = payload
  const channel = payload.channel ?? "whatsapp"

  // 1. Load orchestrator agent config
  const agent = await getOrchestratorAgent(agentId)
  if (!agent) {
    logger.warn({ agentId }, "No orchestrator agent found — skipping")
    return
  }

  // 2. Get or create conversation. For embed channel we attach the visitorId
  // so the dashboard / queries can distinguish web from WhatsApp without
  // pattern-matching phoneNumber.
  // For a group the thread is the GROUP, so the display name is the group
  // subject and the stored JID is the group's — not the participant's, which
  // changes with every message.
  const group = channel === "whatsapp_group" && payload.groupJid
    ? await getGroupChat(agentId, payload.groupJid)
    : null

  const conversation = await getOrCreateConversation(
    agentId,
    fromPhone,
    agent.id,
    {
      contactName: channel === "whatsapp_group" ? (group?.subject ?? "WhatsApp group") : pushName,
      channel,
      visitorId: payload.visitorId,
      // Store the raw chat JID for label matching (WhatsApp only — @lid/@s.whatsapp.net).
      senderJid: isWhatsApp(channel) ? (payload.groupJid ?? senderJid) : undefined,
    }
  )

  if (channel === "whatsapp_group" && payload.groupJid) {
    await linkGroupConversation(agentId, payload.groupJid, conversation.id).catch((err) => {
      logger.warn({ agentId, err: err?.message }, "Failed to link group conversation")
    })
  }

  // 2a. Persist CTWA ad context on first detection. Sticky-first — won't
  // overwrite an existing value, so a later ad click can't clobber the
  // original context the AI used to greet the customer.
  if (incomingAdContext && !conversation.adContext) {
    const stored = await setConversationAdContextIfEmpty(conversation.id, incomingAdContext)
    if (stored) {
      conversation.adContext = incomingAdContext // reflect locally for the inline reply below
      logger.info({ agentId, conversationId: conversation.id, adTitle: incomingAdContext.title }, "Captured CTWA ad referral on conversation")
    }
  }

  // 3. Always save the inbound message regardless of mode. We pass the
  // payload's messageId as the row id so the widget's optimistic-render
  // id matches the DB row exactly — prevents the double-bubble problem
  // when polling fetches the same content back. messageId is already
  // unique and is also our dedup key, so reusing it as a row id is safe.
  // If the inbound message carried an image, store it so it shows in the
  // dashboard thread. Best-effort — a storage hiccup must not drop the message.
  let inboundMediaUrl: string | null = null
  if (payload.imageDataUrl) {
    inboundMediaUrl = await storeConversationImage(agentId, payload.messageId, payload.imageDataUrl)
      .catch((err) => { logger.warn({ agentId, err: err?.message }, "Failed to store inbound image"); return null })
  }
  await insertMessage({
    conversationId: conversation.id,
    direction: "inbound",
    content: text,
    mediaUrl: inboundMediaUrl,
    id: payload.messageId,
    senderJid: channel === "whatsapp_group" ? senderJid : null,
    senderName: channel === "whatsapp_group" ? (payload.senderName ?? null) : null,
  })
  // Anchor for the human-interjection check: any operator reply AFTER this
  // moment means a human answered this customer message first — the AI's
  // pending reply must then be dropped, not sent as a stale double-answer.
  const inboundSavedAt = new Date()

  // Real-time: tell any open dashboard stream a customer message landed, so it
  // shows immediately — even when AI is paused (human-handoff mode below).
  await publishSseEvent(agentId, "message", {
    conversationId: conversation.id,
    direction: "inbound",
  })

  // 4. Debounce decision. When the agent has a reply delay, bump the
  // conversation's sequence token and schedule a delayed reply job instead of
  // replying now. If the customer sends more messages within the window, each
  // bumps the token and schedules its own job; when the jobs fire, only the one
  // whose token still matches proceeds (see handleReplyJob), so the burst yields
  // a single reply built from the full history. WhatsApp only — the embed widget
  // polls for replies and expects them promptly, so it never debounces.
  const replyDelayMs = isWhatsApp(channel) ? await getReplyDelayMs(agentId) : 0
  if (replyDelayMs > 0) {
    const redis = getRedis()
    const seq = await redis.incr(seqKey(conversation.id))
    await redis.expire(seqKey(conversation.id), 3600)
    await inboundQueue.add(
      "reply",
      {
        conversationId: conversation.id,
        agentId,
        senderJid,
        channel,
        latestText: text,
        imageDataUrl: payload.imageDataUrl,
        inboundSavedAt: inboundSavedAt.toISOString(),
        seq,
        groupJid: payload.groupJid,
        senderName: payload.senderName,
        triggerMessageId: payload.messageId,
      } satisfies ReplyJobPayload,
      { delay: replyDelayMs }
    )
    logger.info({ agentId, conversationId: conversation.id, seq, delayMs: replyDelayMs }, "Reply debounced — scheduled")
    return
  }

  // Instant path (delay off) — reply now, exactly as before.
  await generateReply(agent, conversation, {
    senderJid,
    channel,
    latestText: text,
    imageDataUrl: payload.imageDataUrl,
    inboundSavedAt,
    groupJid: payload.groupJid,
    senderName: payload.senderName,
    triggerMessageId: payload.messageId,
  })
}

/**
 * Handle a delayed "reply" job. Skips if a newer message has arrived for this
 * conversation (a later job will produce the coalesced reply); otherwise reloads
 * current agent + conversation state and generates one reply from the full,
 * now-complete history.
 */
export async function handleReplyJob(data: ReplyJobPayload): Promise<void> {
  const redis = getRedis()
  const current = await redis.get(seqKey(data.conversationId))
  // A newer message bumped the token after this job was scheduled — its own job
  // will produce the reply, so this one bows out. (current === null only if the
  // key expired, which can't happen within the ≤60s delay — process to be safe.)
  if (current !== null && Number(current) !== data.seq) {
    logger.debug({ conversationId: data.conversationId, seq: data.seq, current }, "Reply superseded by a newer message — skipping")
    return
  }

  const agent = await getOrchestratorAgent(data.agentId)
  if (!agent) {
    logger.warn({ agentId: data.agentId }, "No orchestrator agent found for reply job — skipping")
    return
  }
  const conversation = await getConversationById(data.conversationId)
  if (!conversation) {
    logger.warn({ conversationId: data.conversationId }, "Conversation gone for reply job — skipping")
    return
  }

  await generateReply(agent, conversation, {
    senderJid: data.senderJid,
    channel: data.channel,
    latestText: data.latestText,
    imageDataUrl: data.imageDataUrl,
    inboundSavedAt: new Date(data.inboundSavedAt),
    groupJid: data.groupJid,
    senderName: data.senderName,
    triggerMessageId: data.triggerMessageId,
  })
}

/**
 * Generate and dispatch the AI reply for a conversation whose latest inbound is
 * already persisted. Runs the mode checks, the LLM turn (which sees the whole
 * recent history — so a coalesced burst is answered in one message), the
 * optional reply guard, then persists + dispatches. Shared by the instant path
 * and the debounced reply job so the two can't drift.
 */
async function generateReply(agent: OrchestratorAgent, conversation: Conversation, ctx: ReplyContext): Promise<void> {
  const startMs = Date.now()
  const { senderJid, channel, latestText, imageDataUrl, inboundSavedAt, groupJid, senderName } = ctx
  const agentId = agent.agentId
  const conversationId = conversation.id

  // Keep the chat's WhatsApp labels current — a cheap, throttled, classify-only
  // pass (no reply, no credit charge). Runs whether or not the AI ends up
  // replying. The in-reply tag_conversation tool only fires when the model
  // volunteers it — almost never — so this classify pass is what actually keeps
  // chats tagged. WhatsApp only; gated by the chatTaggingEnabled master switch.
  const maybeBackgroundTag = async () => {
    if (channel !== "whatsapp") return  // 1:1 only — labels are a per-contact CRM concept
    try {
      if (await isChatTaggingEnabled(agentId)) {
        await classifyAndTagInBackground({
          agentId,
          model: agent.model,
          conversationId,
          senderJid,
          latestText,
        })
      }
    } catch (err) {
      logger.warn({ agentId, conversationId, err: String(err) }, "background tag attempt failed")
    }
  }

  // Check mode — skip AI reply if a human is handling this conversation.
  if (conversation.mode === "human") {
    await maybeBackgroundTag()
    logger.info({ agentId, conversationId }, "Conversation in human handoff mode — skipping AI reply")
    return
  }

  // Per-group silence. The worker already established we were addressed; this
  // second gate lets an operator mute a group from the dashboard without
  // waiting out the worker's 60s config cache.
  let groupSubject: string | null = null
  if (channel === "whatsapp_group" && groupJid) {
    const group = await getGroupChat(agentId, groupJid)
    if (!group || group.replyMode === "off") {
      logger.info({ agentId, conversationId, groupJid }, "Group reply mode off — skipping AI reply")
      return
    }
    groupSubject = group.subject
  }

  // Global master switch — skip the AI for ALL conversations when the agent has
  // "AI replies" turned off (the inbound message is still saved during ingest).
  if (await isAiRepliesPaused(agentId)) {
    await maybeBackgroundTag()
    logger.info({ agentId, conversationId }, "AI replies disabled for agent — skipping AI reply")
    return
  }

  // Per-label AI-off — stay silent on chats carrying a label the operator set to
  // "AI off" (e.g. cold leads they handle manually). Dynamic: remove the label
  // and the AI resumes. WhatsApp only (labels don't exist on the widget).
  if (isWhatsApp(channel) && await chatHasAiDisabledLabel(agentId, conversation.phoneNumber, groupJid ?? senderJid)) {
    await maybeBackgroundTag()
    logger.info({ agentId, conversationId }, "Chat has an AI-off label — skipping AI reply")
    return
  }

  // Don't waste tokens on a reply for a chat that's already been handled. If a
  // human answered this customer (dashboard or their own phone) during the queue
  // / debounce wait, skip generation entirely — for EVERY plan, paid included.
  // (A second check after generation still catches a human who replies WHILE the
  // LLM is running.)
  if (await humanIntervenedSince(conversationId, inboundSavedAt)) {
    logger.info({ agentId, conversationId }, "Human already replied — skipping AI generation (no LLM call)")
    return
  }

  // Credit gate BEFORE the LLM call. If the account is out of funds the worker
  // would block the send anyway, so don't burn tokens generating (or persist) an
  // undelivered reply. WhatsApp only (embed bills post-delivery and never blocks);
  // fail-open so a check hiccup never halts a paying customer's replies.
  if (isWhatsApp(channel) && !(await canAffordReply(agentId))) {
    logger.info({ agentId, conversationId }, "Account out of credits — skipping AI reply (no LLM call, no send)")
    return
  }

  // Build context. Only inject the ad referral section during the opening
  // exchanges so the AI doesn't keep referencing the ad weeks later for
  // unrelated questions.
  const messageCount = await getConversationMessageCount(conversationId)
  const adContextForPrompt = conversation.adContext && messageCount <= 6 ? conversation.adContext : null
  let systemPrompt = await buildSystemPrompt(agent, "Africa/Lagos", latestText, adContextForPrompt)

  // Without this the model writes a DM-shaped reply into a room of 40 people:
  // over-familiar, too long, and addressed to nobody in particular.
  if (channel === "whatsapp_group") {
    systemPrompt += [
      "",
      `## Group chat`,
      `You are in a WhatsApp group${groupSubject ? ` ("${groupSubject}")` : ""}, not a private conversation.`,
      `${senderName ?? "Someone"} addressed you directly. Answer them, and only them.`,
      "Everyone in the group sees your reply, so keep it short and on-topic.",
      "Do not greet the group, do not summarise the conversation, and do not address anyone who did not ask you something.",
      "You only see messages that tag you, not the surrounding chat. If a question depends on context you cannot see, ask for the missing detail instead of guessing.",
    ].join("\n")
  }
  const messages = await buildMessages(conversationId, agent.shortTermWindow)

  // Run the agent turn (LLM tool-calling loop). Extracted into runAgentTurn so
  // the WhatsApp/embed inbound path and the synchronous developer API share one
  // engine and can't drift.
  const turn = await runAgentTurn(agent, systemPrompt, messages, {
    agentId,
    conversationId,
    // Tools (send_image, send_product_album, …) dispatch to this JID. In a
    // group that must be the group, not the participant who tagged us.
    senderJid: groupJid ?? senderJid,
    imageDataUrl,
  })
  const totalInputTokens = turn.inputTokens
  const totalOutputTokens = turn.outputTokens
  const collectedToolResults = turn.collectedToolResults
  const finalReply = turn.finalReply

  if (!finalReply) {
    logger.warn({ agentId, conversationId }, "LLM returned empty reply")
    return
  }

  // Guard (optional, per-agent toggle — off by default). When enabled, a second
  // model oversees the reply before it goes out: it keeps a good reply as-is or
  // rewrites a repetitive/rambling/awkward one into the right short reply. It
  // NEVER suppresses and NEVER hands off — the customer always gets a reply.
  // Handoffs are owned solely by the main agent's request_human_handoff tool,
  // which has the full context (including any image the customer sent); the
  // text-only guard would over-escalate routine questions. When disabled, the
  // AI's reply is sent exactly as written.
  let effectiveReply = finalReply
  if (await isReplyGuardEnabled(agentId)) {
    effectiveReply = await guardReply(messages, finalReply)
  }

  // Output shaping — rewrite any markdown the model emitted into WhatsApp's own
  // formatting (**bold** → *bold*, headings, etc.), convert markdown links to
  // plain URLs, then split long replies into multiple messages.
  const replyParts = splitReply(detachUrlPunctuation(sanitizeWhatsAppLinks(sanitizeWhatsAppFormatting(stripImageUrls(effectiveReply)))))

  // Build structured payload (product cards etc.) from the tool results captured
  // during the LLM loop. Attaches only to the first part so the cards don't
  // render twice when a long reply gets split.
  const richContent = buildRichContent(collectedToolResults)

  // Human-interjection gate. The LLM turn takes seconds — if an operator
  // answered this customer (dashboard or their own phone) or took the chat to
  // human mode while we were generating, drop the reply BEFORE it's persisted or
  // dispatched. The worker re-checks again at send time (after the anti-ban
  // delays), so both windows are covered.
  if (await humanIntervenedSince(conversationId, inboundSavedAt)) {
    logger.info(
      { agentId, conversationId },
      "Human replied first — dropping the AI reply (not persisted, not sent)"
    )
    return
  }

  // Persist outbound message(s), keeping each part's row id so the worker can
  // delete the row if it aborts the send (human replied while queued).
  const partMessageIds: string[] = []
  for (let i = 0; i < replyParts.length; i++) {
    const partId = await insertMessage({
      conversationId,
      direction: "outbound",
      content: replyParts[i],
      richContent: i === 0 ? richContent ?? undefined : undefined,
      tokensInput: totalInputTokens,
      tokensOutput: totalOutputTokens,
      modelUsed: agent.model,
    })
    partMessageIds.push(partId)
  }

  // Real-time: notify open dashboard streams that the AI reply is persisted.
  await publishSseEvent(agentId, "message", {
    conversationId,
    direction: "outbound",
  })

  // Dispatch via transport. Embed conversations skip the Baileys worker
  // round-trip — the outbound rows persisted above are picked up by the
  // visitor's widget via polling on /api/embed/messages.
  if (channel !== "embed") {
    for (let i = 0; i < replyParts.length; i++) {
      await dispatchReply({
        agentId,
        conversationId,
        // A group reply goes to the GROUP. senderJid is the participant who
        // tagged us; sending there would DM them instead of answering in the room.
        toJid: groupJid ?? senderJid,
        text: replyParts[i],
        source: "ai",
        // Quote the triggering message on the first part only — quoting every
        // part of a split reply is noise.
        ...(channel === "whatsapp_group" && i === 0
          ? { quotedMessageId: ctx.triggerMessageId, quotedParticipant: senderJid, quotedText: latestText }
          : {}),
        // The persisted row backing this part — lets the worker delete it if it
        // aborts the send because a human replied while the job waited.
        messageId: partMessageIds[i],
        // PAYG: charge the full turn's tokens against the FIRST part only.
        // Subsequent parts pass 0/0 so the worker doesn't double-charge.
        tokensInput: i === 0 ? totalInputTokens : 0,
        tokensOutput: i === 0 ? totalOutputTokens : 0,
      })
    }
  } else {
    // Embed skips the Baileys worker (and thus its per-message billing), so
    // charge the turn's tokens here — once — so widget replies count toward
    // credits just like WhatsApp. Best-effort: the reply is already persisted.
    await chargeEmbedTurn({
      agentId,
      conversationId,
      tokensInput: totalInputTokens,
      tokensOutput: totalOutputTokens,
    }).catch((err) => logger.error({ err, agentId, conversationId }, "Failed to charge embed turn"))
  }

  // Tag after the reply is dispatched, so classification never adds latency to
  // the customer's reply and never affects this turn's reply decision.
  await maybeBackgroundTag()

  const duration = Date.now() - startMs
  logger.info({
    agentId,
    conversationId,
    duration,
    inputTokens: totalInputTokens,
    outputTokens: totalOutputTokens,
    replyParts: replyParts.length,
  }, "Inbound message processed")
}

/**
 * WhatsApp has its own formatting, NOT markdown. The model (gpt-4o-mini) defaults
 * to markdown — most visibly **bold** (two asterisks), which WhatsApp renders as
 * the literal characters "**bold**". Rewrite the common markdown the model emits
 * into WhatsApp's markup so output is always correct regardless of what it wrote.
 *
 * WhatsApp markup: *bold* (one asterisk) · _italic_ · ~strike~ · ```mono``` ·
 * "- " / "1. " lists · "> " quote. It does NOT support ** , #/## headings,
 * [text](url) links (handled separately), tables, or underline.
 */
function sanitizeWhatsAppFormatting(text: string): string {
  return text
    // ***bold italic*** → WhatsApp *_bold italic_*  (do before ** so it isn't half-matched)
    .replace(/\*\*\*([^*\n]+)\*\*\*/g, "*_$1_*")
    // **bold** → *bold*  (markdown double asterisk → WhatsApp single)
    .replace(/\*\*([^*\n]+)\*\*/g, "*$1*")
    // __bold__ → _italic_  (markdown double underscore; WhatsApp has no bold-underscore)
    .replace(/__([^_\n]+)__/g, "_$1_")
    // # / ## / … headings → a bold line (strip the leading #s and any stray edge markers)
    .replace(/^[ \t]*#{1,6}[ \t]+(.+?)[ \t]*$/gm, (_m, h) => `*${h.replace(/^[*_~\s]+|[*_~\s]+$/g, "")}*`)
}

/**
 * WhatsApp renders plain URLs as clickable but does NOT support markdown links.
 * Models often emit [label](url) — or a botched [label(url) that drops the
 * closing bracket — which a customer sees as broken, unclickable text. Replace
 * any such link with just the plain URL so it actually works (on WhatsApp and
 * every other channel). The label is dropped because the surrounding sentence
 * already provides the context.
 */
function sanitizeWhatsAppLinks(text: string): string {
  // [label](url) | [label(url) | [label] (url) — label optional, closing ] and
  // whitespace optional. Only rewrites when the parenthetical is a real URL, so
  // ordinary "[note](see above)" text is left untouched.
  const MD_LINK = /\[[^\]\n(]*\]?\s*\((https?:\/\/[^\s)]+|www\.[^\s)]+)\)/gi
  return text.replace(MD_LINK, (_match, url) => url)
}

/**
 * Split a long reply into multiple WhatsApp messages.
 * Only splits if >1200 chars and has paragraph breaks. The old 800 threshold
 * turned routine 800-1200ch replies (a plan list, a product rundown) into a
 * message + an awkward stub — customers experienced it as message spam. A
 * trailing fragment under 150 chars is merged into the previous part for the
 * same reason: one slightly-long message beats a two-line orphan.
 */
const SPLIT_THRESHOLD = 1200
const MIN_TAIL_CHARS = 150

function splitReply(text: string): string[] {
  if (text.length <= SPLIT_THRESHOLD) return [text]

  const paragraphs = text.split(/\n\n+/)
  if (paragraphs.length <= 1) return [text]

  // Group paragraphs into chunks of ~SPLIT_THRESHOLD chars
  const parts: string[] = []
  let current = ""

  for (const para of paragraphs) {
    if (current && (current.length + para.length + 2) > SPLIT_THRESHOLD) {
      parts.push(current.trim())
      current = para
    } else {
      current = current ? `${current}\n\n${para}` : para
    }
  }
  if (current.trim()) parts.push(current.trim())

  // Never end on a stub: fold a tiny final part into the one before it.
  if (parts.length > 1 && parts[parts.length - 1].length < MIN_TAIL_CHARS) {
    const tail = parts.pop()!
    parts[parts.length - 1] = `${parts[parts.length - 1]}\n\n${tail}`
  }

  return parts.length > 0 ? parts : [text]
}
