import type { WASocket } from "@whiskeysockets/baileys"
import { webhookEmitter } from "../dashboard/webhook-emitter.js"
import { config } from "../config.js"
import { logger as rootLogger } from "../lib/logger.js"
import { resolvePhone } from "./contacts-store.js"

const logger = rootLogger.child({ module: "event-handlers" })

// §7.7 — Random delay before marking read (2–8s)
function readDelay() {
  return 2000 + Math.random() * 6000
}

export function createEventHandlers(sock: WASocket, agentId: string) {
  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    if (type !== "notify") return

    for (const msg of messages) {
      // §9 — Ignore non-DMs
      if (msg.key.fromMe) continue
      if (msg.key.remoteJid?.endsWith("@broadcast")) continue
      if (msg.key.remoteJid?.endsWith("@g.us")) continue // groups
      if (!msg.key.remoteJid) continue

      const senderJid = msg.key.remoteJid
      // remoteJidAlt is the PN (real phone JID) when remoteJid is a LID — available since Baileys 6.8.0
      const altJid = (msg.key as Record<string, unknown>).remoteJidAlt as string | undefined
      const phoneNumber = altJid
        ? altJid.split("@")[0].split(":")[0]
        : resolvePhone(agentId, senderJid)
      const pushName = msg.pushName ?? undefined

      const text =
        msg.message?.conversation ??
        msg.message?.extendedTextMessage?.text ??
        null

      if (!text) {
        logger.debug({ agentId, senderJid }, "Non-text message received, skipping")
        continue
      }

      logger.info({ agentId, senderJid, pushName: msg.pushName ?? null, preview: text.slice(0, 60) }, "Inbound message")

      // §7.7 — Mark read with natural delay
      setTimeout(async () => {
        try {
          await sock.readMessages([msg.key])
        } catch {
          // Not critical
        }
      }, readDelay())

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
