import type { WASocket } from "@whiskeysockets/baileys"
import { webhookEmitter } from "../dashboard/webhook-emitter.js"
import { config } from "../config.js"
import { logger as rootLogger } from "../lib/logger.js"
import { resolvePhone } from "./contacts-store.js"
import { getConversationMode, getAgentIsHumanMode, saveHumanOutboundMessage } from "../db/queries.js"
import { transcribeVoiceNote } from "../voice/transcribe.js"
import { creditsForVoice } from "../billing/credits.js"
import { wasSentByUs } from "./sent-message-cache.js"

const logger = rootLogger.child({ module: "event-handlers" })

// §7.7 — Random delay before marking read (2–8s)
function readDelay() {
  return 2000 + Math.random() * 6000
}

export function createEventHandlers(sock: WASocket, agentId: string) {
  // Any message timestamped more than 30s before we started this session is
  // a replay from while we were offline — ignore it to avoid the agent
  // replying to stale messages on reconnect.
  const sessionStartedAt = Date.now()

  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    if (type !== "notify") return

    for (const msg of messages) {
      // §9 — Ignore broadcasts and groups
      if (msg.key.remoteJid?.endsWith("@broadcast")) continue
      if (msg.key.remoteJid?.endsWith("@g.us")) continue
      if (!msg.key.remoteJid) continue

      // Replay protection — skip messages that arrived before this session started
      const msgTimestampMs = (msg.messageTimestamp as number) * 1000
      if (msgTimestampMs < sessionStartedAt - 30_000) {
        logger.debug({ agentId, msgTimestampMs, sessionStartedAt }, "Skipping pre-connection message")
        continue
      }

      const senderJid = msg.key.remoteJid
      // remoteJidAlt is the PN (real phone JID) when remoteJid is a LID — available since Baileys 6.8.0
      const altJid = (msg.key as Record<string, unknown>).remoteJidAlt as string | undefined
      const phoneNumber = altJid
        ? altJid.split("@")[0].split(":")[0]
        : resolvePhone(agentId, senderJid)
      const pushName = msg.pushName ?? undefined

      // Handle human operator's own replies sent directly from their phone
      if (msg.key.fromMe) {
        const msgId = msg.key.id
        if (msgId && !wasSentByUs(msgId)) {
          // This message came from the operator's phone (not from our outbound queue)
          const isHuman = await getAgentIsHumanMode(agentId).catch(() => false)
          if (isHuman) {
            const text =
              msg.message?.conversation ??
              msg.message?.extendedTextMessage?.text ??
              null
            if (text) {
              await saveHumanOutboundMessage(agentId, phoneNumber, text).catch((err) => {
                logger.error({ err, agentId }, "Failed to save human operator message")
              })
              webhookEmitter.emit("message.sent", { agentId })
              logger.info({ agentId, phoneNumber }, "Human operator message saved from phone")
            }
          }
        }
        continue
      }

      let text: string | null =
        msg.message?.conversation ??
        msg.message?.extendedTextMessage?.text ??
        null

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

      if (!text) {
        logger.debug({ agentId, senderJid }, "Non-text message received, skipping")
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

      // Forward to orchestrator for AI processing
      try {
        await forwardToOrchestrator({
          agentId,
          messageId: msg.key.id ?? `${Date.now()}`,
          fromPhone: phoneNumber,
          senderJid,
          text,
          timestamp: (msg.messageTimestamp as number) * 1000,
          pushName,
          extraCredits: voiceCredits || undefined,
        })
      } catch (err) {
        logger.error({ err, agentId, senderJid }, "Failed to forward to orchestrator")
      }
    }
  })
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
