import type { WASocket } from "baileys"
import { getOrCreateCustomer, getRecentConversationLogs, getAgent } from "../db/queries.js"
import { elevenlabsClient } from "../agent/elevenlabs-client.js"
import { outboundQueue } from "../queue/outbound-queue.js"
import { webhookEmitter } from "../dashboard/webhook-emitter.js"
import { logger as rootLogger } from "../lib/logger.js"

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
      const phoneNumber = senderJid.split("@")[0]

      const text =
        msg.message?.conversation ??
        msg.message?.extendedTextMessage?.text ??
        null

      if (!text) {
        // Media message — log and skip for now (phase 2)
        logger.debug({ agentId, senderJid }, "Non-text message received, skipping")
        continue
      }

      logger.info({ agentId, senderJid, preview: text.slice(0, 60) }, "Inbound message")

      // §7.7 — Mark read with natural delay
      setTimeout(async () => {
        try {
          await sock.readMessages([msg.key])
        } catch {
          // Not critical
        }
      }, readDelay())

      // Emit to dashboard (human-mode passthrough)
      webhookEmitter.emit("message.inbound", {
        agentId,
        senderJid,
        phoneNumber,
        text,
        messageId: msg.key.id,
        timestamp: (msg.messageTimestamp as number) * 1000,
      })

      // Look up agent to check mode and get ElevenLabs agent ID
      const agent = await getAgent(agentId)
      if (!agent?.elevenlabsAgentId) {
        logger.warn({ agentId }, "Agent has no ElevenLabs agent ID — cannot respond")
        continue
      }

      // Get/create customer for context injection
      const customer = await getOrCreateCustomer(phoneNumber, agentId)
      const history = await getRecentConversationLogs(phoneNumber, agentId, 10)

      // §9 — Call ElevenLabs text agent via WebSocket
      try {
        const reply = await elevenlabsClient.sendMessage({
          elevenlabsAgentId: agent.elevenlabsAgentId,
          userMessage: text,
          phoneNumber,
          customerName: customer?.name ?? null,
          conversationHistory: history,
          customerSummary: customer?.conversationSummary ?? null,
        })

        if (!reply) continue

        // §7.7 — Additional delay before typing indicator (1–3s)
        const typingDelay = 1000 + Math.random() * 2000
        setTimeout(async () => {
          await outboundQueue.enqueue({
            agentId,
            toJid: senderJid,
            text: reply,
            conversationId: undefined,
            source: "ai",
          })
        }, typingDelay)
      } catch (err) {
        logger.error({ err, agentId, senderJid }, "ElevenLabs call failed")
      }
    }
  })
}
