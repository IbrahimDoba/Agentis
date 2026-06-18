import type { WASocket, WAMessage } from "@whiskeysockets/baileys"
import { downloadMediaMessage } from "@whiskeysockets/baileys"
import { webhookEmitter } from "../dashboard/webhook-emitter.js"
import { config } from "../config.js"
import { logger as rootLogger } from "../lib/logger.js"
import { resolvePhone, resolveContactName } from "./contacts-store.js"
import { getConversationMode, saveHumanOutboundMessage } from "../db/queries.js"
import { transcribeVoiceNote } from "../voice/transcribe.js"
import { creditsForVoice } from "../billing/credits.js"
import { wasSentByUs } from "./sent-message-cache.js"
import { markInboundActivity } from "./activity-tracker.js"
import { createHash } from "crypto"

const logger = rootLogger.child({ module: "event-handlers" })

// §7.7 — Random delay before marking read (2–8s)
function readDelay() {
  return 2000 + Math.random() * 6000
}

// Stable id for an inbound message when WhatsApp doesn't give us a key.id.
//
// This used to be `${Date.now()}`, which was a latent duplicate-reply bug:
// when the session reconnects (and ours flaps — see error.md), WhatsApp
// REDELIVERS the recent messages. A fresh Date.now() on each redelivery
// produced a brand-new messageId every time, so the orchestrator's
// messageId-based dedup never recognised the replay — and the customer got a
// second (separately-generated, differently-worded) AI reply. Deriving the id
// from the message's own immutable fields makes it identical across
// redeliveries, so the dedup catches the replay. Real key.id is always
// preferred; this only kicks in when it's missing.
function deriveStableMsgId(agentId: string, senderJid: string, text: string, ts: unknown): string {
  const tsNum = typeof ts === "number" ? ts : 0
  const hash = createHash("sha1")
    .update(`${agentId}|${senderJid}|${tsNum}|${text}`)
    .digest("hex")
    .slice(0, 24)
  return `wa-derived:${hash}`
}

// Pull an inbound image so the (vision-capable) AI can see it — either a photo
// the customer sent directly, or one they quote-replied to (e.g. tapping a
// specific cap in the album we sent and asking "how much is this?"). Returns a
// base64 data URL, or null (no image / too big / download failed → text-only).
async function extractInboundImage(msg: WAMessage): Promise<string | null> {
  const m = msg.message as any
  const direct =
    m?.imageMessage ||
    m?.ephemeralMessage?.message?.imageMessage ||
    m?.viewOnceMessage?.message?.imageMessage ||
    m?.viewOnceMessageV2?.message?.imageMessage
  const quotedCtx = m?.extendedTextMessage?.contextInfo
  const quoted = quotedCtx?.quotedMessage?.imageMessage

  let downloadable: WAMessage | null = null
  let mimetype = "image/jpeg"
  if (direct) {
    downloadable = msg
    mimetype = direct.mimetype || mimetype
  } else if (quoted) {
    downloadable = {
      key: { remoteJid: msg.key.remoteJid, id: quotedCtx.stanzaId, fromMe: false, participant: quotedCtx.participant },
      message: quotedCtx.quotedMessage,
    } as WAMessage
    mimetype = quoted.mimetype || mimetype
  }
  if (!downloadable) return null

  try {
    const buffer = (await downloadMediaMessage(downloadable, "buffer", {})) as Buffer
    if (!buffer?.length || buffer.length > 5 * 1024 * 1024) return null
    return `data:${mimetype};base64,${buffer.toString("base64")}`
  } catch (err) {
    logger.warn({ err }, "Failed to download inbound image — falling back to text-only")
    return null
  }
}

export function createEventHandlers(sock: WASocket, agentId: string) {
  // Any message timestamped more than 30s before we started this session is
  // a replay from while we were offline — ignore it to avoid the agent
  // replying to stale messages on reconnect.
  const sessionStartedAt = Date.now()
  // Seed liveness so a freshly-connected (and possibly quiet) session isn't
  // immediately flagged as deaf by the watchdog.
  markInboundActivity(agentId)

  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    // Allow both "notify" (live) and "append" (history sync / delayed delivery)
    if (type !== "notify" && type !== "append") return

    for (const msg of messages) {
      // §9 — Ignore broadcasts and groups
      if (msg.key.remoteJid?.endsWith("@broadcast")) continue
      if (msg.key.remoteJid?.endsWith("@g.us")) continue
      if (!msg.key.remoteJid) continue

      // Replay protection — skip messages that arrived before this session started
      // Use a 5-minute window to catch delayed/queued messages without replaying old history
      const msgTimestampMs = (msg.messageTimestamp as number) * 1000
      if (msgTimestampMs < sessionStartedAt - 300_000) {
        logger.debug({ agentId, msgTimestampMs, sessionStartedAt, type }, "Skipping pre-connection message")
        continue
      }

      // Liveness: we received a real message event — proof the receive pipeline
      // is alive (used by the deaf-session watchdog).
      markInboundActivity(agentId)

      const senderJid = msg.key.remoteJid
      // remoteJidAlt is the PN (real phone JID) when remoteJid is a LID — available since Baileys 6.8.0
      const altJid = (msg.key as Record<string, unknown>).remoteJidAlt as string | undefined
      const phoneNumber = altJid
        ? altJid.split("@")[0].split(":")[0]
        : resolvePhone(agentId, senderJid)
      const pushName = msg.pushName ?? resolveContactName(agentId, phoneNumber) ?? undefined

      // Operator replied to the customer directly from their own phone (not
      // via our dashboard). The wasSentByUs cache already excludes the AI's
      // own messages reflecting back via WhatsApp's multi-device sync, plus
      // the 5-minute replay filter at session start covers worker restarts —
      // so any fromMe message that ISN'T in the cache is a genuine operator
      // reply. Save it AND flip the conversation to human mode so AI stops
      // replying to the customer's next inbound (saveHumanOutboundMessage
      // handles the mode flip atomically with the message insert).
      if (msg.key.fromMe) {
        const msgId = msg.key.id
        if (msgId && !wasSentByUs(msgId)) {
          const _mOut = msg.message as any
          const text: string | null =
            _mOut?.conversation ||
            _mOut?.extendedTextMessage?.text ||
            null
          if (text) {
            await saveHumanOutboundMessage(agentId, phoneNumber, text).catch((err) => {
              logger.error({ err, agentId }, "Failed to save human operator message")
            })
            webhookEmitter.emit("message.sent", { agentId })
            logger.info({ agentId, phoneNumber }, "Operator phone-sent message saved + AI paused")
          }
        }
        continue
      }

      const _m = msg.message as any
      let text: string | null =
        _m?.conversation ||
        _m?.extendedTextMessage?.text ||
        _m?.interactiveResponseMessage?.body?.text ||
        _m?.imageMessage?.caption ||
        _m?.videoMessage?.caption ||
        _m?.documentMessage?.caption ||
        _m?.buttonsResponseMessage?.selectedDisplayText ||
        _m?.listResponseMessage?.title ||
        _m?.templateButtonReplyMessage?.selectedDisplayText ||
        _m?.ephemeralMessage?.message?.conversation ||
        _m?.ephemeralMessage?.message?.extendedTextMessage?.text ||
        null

      // If this is a quoted reply, prepend the referenced message so the AI has context
      if (text) {
        const quoted = _m?.extendedTextMessage?.contextInfo?.quotedMessage
        const quotedText: string | null =
          quoted?.conversation ||
          quoted?.extendedTextMessage?.text ||
          quoted?.imageMessage?.caption ||
          quoted?.videoMessage?.caption ||
          null
        if (quotedText) {
          text = `[Replying to: "${quotedText}"]\n${text}`
        }
      }

      let voiceCredits = 0

      // Handle voice notes — transcribe if OpenAI key is configured
      if (!text && msg.message?.audioMessage?.ptt) {
        if (!config.OPENAI_API_KEY) {
          logger.debug({ agentId, senderJid }, "Voice note received but OPENAI_API_KEY not set, skipping")
          continue
        }
        try {
          const result = await transcribeVoiceNote(msg, config.OPENAI_API_KEY)
          if (!result.text) {
            logger.debug({ agentId, senderJid }, "Voice note transcription returned empty, skipping")
            continue
          }
          text = `[Voice note]: ${result.text}`
          voiceCredits = creditsForVoice(result.durationSeconds)
          logger.info({ agentId, senderJid, durationSeconds: result.durationSeconds, voiceCredits }, "Voice note transcribed")
        } catch (err) {
          logger.error({ err, agentId, senderJid }, "Voice note transcription failed, skipping")
          continue
        }
      }

      // Vision: pull an image off the message (direct photo or a quoted/tagged
      // one) so the AI can actually see it. An image-only message is no longer
      // dropped — we give it placeholder text so the rest of the pipeline runs.
      const imageDataUrl = await extractInboundImage(msg).catch(() => null)
      if (!text && imageDataUrl) {
        text = "[Image]"
      }

      if (!text) {
        const msgTypes = Object.keys(msg.message ?? {})
        const extText = (msg.message as any)?.extendedTextMessage
        logger.info({ agentId, senderJid, msgTypes, extText: extText ? JSON.stringify(extText).slice(0, 200) : null }, "Non-text message received, skipping")
        continue
      }

      logger.info({ agentId, senderJid, pushName: msg.pushName ?? null, preview: text.slice(0, 60) }, "Inbound message")

      // §7.7 — Mark read with natural delay (skip in human mode — let the human operator read it themselves)
      const convMode = await getConversationMode(phoneNumber, agentId).catch(() => "ai" as const)
      if (convMode !== "human") {
        setTimeout(async () => {
          try {
            await sock.readMessages([msg.key])
          } catch {
            // Not critical
          }
        }, readDelay())
      }

      // Emit to dashboard
      webhookEmitter.emit("message.inbound", {
        agentId,
        senderJid,
        phoneNumber,
        text,
        messageId: msg.key.id,
        timestamp: (msg.messageTimestamp as number) * 1000,
      })

      // Extract click-to-WhatsApp ad referral if present. Only fires on the
      // customer's first message after clicking a CTWA ad — subsequent
      // messages won't carry it. Forwarding null is fine.
      const adContext = extractAdContext(msg.message as Record<string, any> | null | undefined)
      if (adContext) {
        logger.info({ agentId, senderJid, adTitle: adContext.title, sourceId: adContext.sourceId }, "Inbound carries CTWA ad referral")
      }

      // Forward to orchestrator for AI processing
      try {
        await forwardToOrchestrator({
          agentId,
          messageId: msg.key.id ?? deriveStableMsgId(agentId, senderJid, text, msg.messageTimestamp),
          fromPhone: phoneNumber,
          senderJid,
          text,
          timestamp: (msg.messageTimestamp as number) * 1000,
          pushName,
          extraCredits: voiceCredits || undefined,
          adContext: adContext ?? undefined,
          imageDataUrl: imageDataUrl ?? undefined,
        })
      } catch (err) {
        logger.error({ err, agentId, senderJid }, "Failed to forward to orchestrator")
      }
    }
  })
}

/**
 * Extract plain text from any WhatsApp message type.
 * Handles wrappers (ephemeral, viewOnce, documentWithCaption) and
 * all common content types including click-to-WhatsApp ad replies.
 */
function extractText(message: Record<string, any> | null | undefined): string | null {
  if (!message) return null

  // Try the message directly first (covers the vast majority of cases)
  const direct = extractFromMessage(message)
  if (direct) return direct

  // Only then try wrapper containers (ephemeral, viewOnce, etc.)
  const wrappers = [
    message.ephemeralMessage?.message,
    message.viewOnceMessage?.message,
    message.viewOnceMessageV2?.message?.viewOnceMessage?.message,
    message.documentWithCaptionMessage?.message,
  ]
  for (const wrapped of wrappers) {
    if (!wrapped) continue
    const text = extractFromMessage(wrapped)
    if (text) return text
  }

  return null
}

function extractFromMessage(m: Record<string, any>): string | null {
  const raw =
    m.conversation ??
    m.extendedTextMessage?.text ??
    m.interactiveResponseMessage?.body?.text ??
    m.imageMessage?.caption ??
    m.videoMessage?.caption ??
    m.documentMessage?.caption ??
    m.buttonsResponseMessage?.selectedDisplayText ??
    m.listResponseMessage?.title ??
    m.templateButtonReplyMessage?.selectedDisplayText ??
    null

  return raw || null
}

export interface AdContext {
  title: string | null
  body: string | null
  sourceUrl: string | null
  sourceId: string | null
  ctwaClid: string | null
  thumbnailUrl: string | null
  capturedAt: string
}

// Extract a click-to-WhatsApp ad referral payload from any inbound message
// shape — text, image-with-caption, video-with-caption, or wrapped in an
// ephemeral/viewOnce container. Returns null when the message did not
// originate from an ad click. Same surface area as extractText so any new
// message wrapper added there should be mirrored here.
function extractAdContext(
  message: Record<string, any> | null | undefined
): AdContext | null {
  if (!message) return null

  const direct = findExternalAdReply(message)
  if (direct) return normalizeAdReply(direct)

  const wrappers = [
    message.ephemeralMessage?.message,
    message.viewOnceMessage?.message,
    message.viewOnceMessageV2?.message?.viewOnceMessage?.message,
    message.documentWithCaptionMessage?.message,
  ]
  for (const wrapped of wrappers) {
    if (!wrapped) continue
    const ext = findExternalAdReply(wrapped)
    if (ext) return normalizeAdReply(ext)
  }

  return null
}

function findExternalAdReply(m: Record<string, any>): Record<string, any> | null {
  return (
    m.extendedTextMessage?.contextInfo?.externalAdReply ??
    m.imageMessage?.contextInfo?.externalAdReply ??
    m.videoMessage?.contextInfo?.externalAdReply ??
    m.documentMessage?.contextInfo?.externalAdReply ??
    null
  )
}

function normalizeAdReply(raw: Record<string, any>): AdContext {
  return {
    title: typeof raw.title === "string" && raw.title.length > 0 ? raw.title : null,
    body: typeof raw.body === "string" && raw.body.length > 0 ? raw.body : null,
    sourceUrl: typeof raw.sourceUrl === "string" && raw.sourceUrl.length > 0 ? raw.sourceUrl : null,
    sourceId: typeof raw.sourceId === "string" && raw.sourceId.length > 0 ? raw.sourceId : null,
    ctwaClid: typeof raw.ctwaClid === "string" && raw.ctwaClid.length > 0 ? raw.ctwaClid : null,
    thumbnailUrl: typeof raw.thumbnailUrl === "string" && raw.thumbnailUrl.length > 0 ? raw.thumbnailUrl : null,
    capturedAt: new Date().toISOString(),
  }
}

async function forwardToOrchestrator(payload: {
  agentId: string
  messageId: string
  fromPhone: string
  senderJid: string
  text: string
  timestamp: number
  pushName?: string
  extraCredits?: number  // e.g. voice transcription cost, billed on top of the AI reply cost
  adContext?: AdContext
  imageDataUrl?: string  // inbound image (base64 data URL) for vision
}): Promise<void> {
  const url = `${config.ORCHESTRATOR_URL}/v1/inbound`

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.ORCHESTRATOR_API_KEY}`,
    },
    body: JSON.stringify(payload),
  })

  if (!res.ok) {
    const body = await res.text().catch(() => "")
    throw new Error(`Orchestrator returned ${res.status}: ${body}`)
  }

  logger.info({ agentId: payload.agentId, fromPhone: payload.fromPhone }, "Forwarded to orchestrator")
}
