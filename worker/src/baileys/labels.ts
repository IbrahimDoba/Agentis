import type { WASocket } from "@whiskeysockets/baileys"
import { resolvePhone } from "./contacts-store.js"
import { upsertWhatsAppLabel, addChatLabelAssoc, removeChatLabelAssoc } from "../db/labels.js"
import { logger as rootLogger } from "../lib/logger.js"

const logger = rootLogger.child({ module: "labels" })

// Mirror WhatsApp Business labels into our DB. WhatsApp owns labels — they're
// created/edited on the phone and applied to chats there or by us. We listen and
// persist so the dashboard and the AI can see them. These events fire on connect
// (app-state sync — initial backfill) and live. Best-effort: a label sync
// failure must NEVER affect messaging, so every write is fire-and-forget with a
// caught error.
export function attachLabelHandlers(sock: WASocket, agentId: string): void {
  // A label was created / renamed / recoloured / deleted on the phone.
  sock.ev.on("labels.edit", (label) => {
    upsertWhatsAppLabel(agentId, {
      waLabelId: label.id,
      name: label.name,
      color: typeof label.color === "number" ? label.color : 0,
      predefinedId: label.predefinedId ?? null,
      deleted: label.deleted === true,
    }).catch((err) => logger.warn({ err, agentId, labelId: label.id }, "labels.edit persist failed"))
  })

  // A label was added to / removed from a chat (or message — we only mirror
  // chat labels for now).
  sock.ev.on("labels.association", ({ association, type }) => {
    if ("messageId" in association) return // skip per-message labels
    const chatJid = association.chatId
    const waLabelId = association.labelId
    const resolved = resolvePhone(agentId, chatJid)
    const phoneNumber = resolved && resolved !== chatJid ? resolved : null

    const op =
      type === "add"
        ? addChatLabelAssoc(agentId, chatJid, phoneNumber, waLabelId, "whatsapp")
        : removeChatLabelAssoc(agentId, chatJid, waLabelId)

    op.catch((err) =>
      logger.warn({ err, agentId, chatJid, waLabelId, type }, "labels.association persist failed")
    )
  })

  logger.info({ agentId }, "Label sync handlers attached")
}
