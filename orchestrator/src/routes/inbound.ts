import type { FastifyInstance } from "fastify"
import { z } from "zod"
import { isDuplicate, isDuplicateContent } from "../orchestrator/dedup.js"
import { inboundQueue } from "../queue/queues.js"
import { logger as rootLogger } from "../lib/logger.js"

const logger = rootLogger.child({ module: "route:inbound" })

const adContextSchema = z.object({
  title: z.string().nullable(),
  body: z.string().nullable(),
  sourceUrl: z.string().nullable(),
  sourceId: z.string().nullable(),
  ctwaClid: z.string().nullable(),
  thumbnailUrl: z.string().nullable(),
  capturedAt: z.string(),
})

export const inboundSchema = z.object({
  agentId: z.string().min(1),
  messageId: z.string().min(1),
  fromPhone: z.string().min(1),
  senderJid: z.string().min(1),
  text: z.string().min(1),
  timestamp: z.number(),
  pushName: z.string().optional(),
  transportType: z.string().optional(),
  adContext: adContextSchema.optional(),
  // Embed-widget specific. When channel === "embed" the orchestrator skips
  // the WhatsApp-only dispatch path and just persists the outbound reply —
  // the visitor's browser picks it up via polling on /api/embed/messages.
  // "meta" = official WhatsApp Cloud API. Runs the full pipeline like whatsapp,
  // but replies dispatch to the frontend's Cloud API send endpoint rather than
  // the Baileys worker.
  channel: z.enum(["whatsapp", "embed", "whatsapp_group", "meta"]).optional(),
  visitorId: z.string().min(1).optional(),
  // Cloud API only: which of our numbers received the message.
  metaPhoneNumberId: z.string().min(1).optional(),
  // Group only: the group JID (the conversation key) and the participant who spoke.
  groupJid: z.string().min(1).optional(),
  senderName: z.string().optional(),
  // Inbound image (data URL or https) for vision. Capped to keep the queue
  // payload sane; the worker only forwards reasonably-sized images.
  imageDataUrl: z.string().max(15_000_000).optional(),
})

export async function inboundRoutes(app: FastifyInstance) {
  app.post("/inbound", async (req, reply) => {
    const parsed = inboundSchema.safeParse(req.body)
    if (!parsed.success) {
      return reply.code(400).send({ error: "Invalid payload", details: parsed.error.flatten() })
    }

    const { agentId, messageId, fromPhone, senderJid, text, timestamp, pushName, adContext, channel, visitorId, imageDataUrl, groupJid, senderName, metaPhoneNumberId } = parsed.data

    // Dedup check
    if (await isDuplicate(messageId)) {
      logger.debug({ messageId }, "Duplicate message — skipping")
      return reply.code(200).send({ status: "duplicate" })
    }

    // Replay guard — a reconnect can redeliver the same WhatsApp message under a
    // different/derived id, which the messageId dedup above won't catch. Dedup
    // on the (agent, sender, text) tuple within a short window so a redelivered
    // message can't trigger a second AI reply. Embed has its own delivery model.
    // Dedup on the STABLE phone identity (fromPhone), not senderJid — the same
    // message can arrive under both a @lid and a phone jid (WhatsApp LID
    // migration), which would otherwise leak past and cause a duplicate reply.
    // In a group, fromPhone is the GROUP, so two members sending the same short
    // text ("hi") inside the replay window would dedup against each other and
    // the second person would be silently ignored. Key on the participant too.
    const dedupSender = channel === "whatsapp_group" ? `${fromPhone}:${senderJid}` : fromPhone
    if (channel !== "embed" && (await isDuplicateContent(agentId, dedupSender, text))) {
      logger.info({ agentId, fromPhone, messageId }, "Duplicate content within replay window — skipping")
      return reply.code(200).send({ status: "duplicate" })
    }

    // Enqueue for processing
    await inboundQueue.add("inbound", {
      agentId,
      messageId,
      fromPhone,
      senderJid,
      text,
      timestamp,
      pushName,
      adContext,
      channel,
      visitorId,
      imageDataUrl,
      // Group replies are addressed to the GROUP. Dropping groupJid here makes
      // the dispatcher fall back to the participant's JID, which DMs the person
      // who tagged us instead of answering in the room.
      groupJid,
      senderName,
      metaPhoneNumberId,
    })

    logger.info({ agentId, fromPhone, messageId }, "Inbound message enqueued")
    return reply.code(200).send({ status: "queued" })
  })
}
