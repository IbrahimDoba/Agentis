import type { WASocket } from "@whiskeysockets/baileys"
import { logger as rootLogger } from "../lib/logger.js"
import {
  bulkInsertHistoryMessages,
  markSessionHistorySynced,
  upsertConversationForHistory,
  type HistoryMessageInsert,
} from "../db/queries.js"
import { resolvePhone, resolveContactName, updateContacts } from "./contacts-store.js"

const logger = rootLogger.child({ module: "history-sync" })

// Cap per-chat to keep the import bounded — matches the orchestrator's
// default shortTermWindow so the AI gets the same depth of context it would
// have had if those messages had arrived live.
const MESSAGES_PER_CHAT = 20

interface MaybeMessage {
  key?: { remoteJid?: string | null; fromMe?: boolean | null; id?: string | null }
  messageTimestamp?: number | { low: number } | null
  message?: Record<string, unknown> | null
  pushName?: string | null
}

interface MaybeChat {
  id?: string
  name?: string | null
}

export function attachHistorySyncHandler(sock: WASocket, agentId: string): void {
  // Baileys may fire this event multiple times as the phone streams chunks.
  // We process every chunk and rely on the dedupe-by-content check (existing
  // conversation + insert with original timestamp) to make re-runs safe-ish.
  // We mark the session as "synced" on the first event so a subsequent
  // reconnect for the same session does NOT request another full pull.
  let firstEventHandled = false

  sock.ev.on("messaging-history.set", async (payload) => {
    const { chats, contacts, messages, isLatest } = payload as {
      chats: MaybeChat[]
      contacts: unknown[]
      messages: MaybeMessage[]
      isLatest?: boolean
    }

    logger.info(
      {
        agentId,
        chats: chats?.length ?? 0,
        contacts: contacts?.length ?? 0,
        messages: messages?.length ?? 0,
        isLatest: isLatest ?? null,
      },
      "messaging-history.set received"
    )

    // 1. Feed the LID/name mapping with whatever the history sync gave us so
    //    resolvePhone() can translate @lid JIDs in the messages below.
    if (Array.isArray(contacts) && contacts.length > 0) {
      try {
        updateContacts(agentId, contacts)
      } catch (err) {
        logger.warn({ err, agentId }, "Failed to seed contacts from history sync")
      }
    }

    // 2. Build a JID → display-name map from the chats payload — used to seed
    //    Conversation.contactName for chats whose contact entry didn't carry a
    //    notify/name field.
    const chatNameByJid = new Map<string, string>()
    for (const c of chats ?? []) {
      if (c?.id && c?.name) chatNameByJid.set(c.id, c.name)
    }

    // 3. Group messages by remoteJid, dropping groups, broadcasts, and
    //    statuses. Keep the last MESSAGES_PER_CHAT per chat.
    const byJid = new Map<string, MaybeMessage[]>()
    for (const m of messages ?? []) {
      const jid = m?.key?.remoteJid
      if (!jid) continue
      if (jid.endsWith("@g.us")) continue
      if (jid.endsWith("@broadcast")) continue
      if (jid === "status@broadcast") continue
      const list = byJid.get(jid) ?? []
      list.push(m)
      byJid.set(jid, list)
    }

    const inserts: HistoryMessageInsert[] = []
    let conversationsTouched = 0
    let messagesPrepared = 0

    for (const [jid, msgs] of byJid) {
      // Sort newest first, take top N, then flip to chronological for insert.
      const tsOf = (m: MaybeMessage) => normalizeTs(m.messageTimestamp)
      const lastN = msgs
        .filter((m) => tsOf(m) > 0)
        .sort((a, b) => tsOf(b) - tsOf(a))
        .slice(0, MESSAGES_PER_CHAT)
        .reverse()

      if (lastN.length === 0) continue

      const phoneNumber = resolvePhone(agentId, jid)
      if (!phoneNumber || phoneNumber === jid) {
        // Couldn't resolve a real phone — likely a LID without a mapping. Skip
        // rather than persist garbage that the dashboard would render as
        // "@lid" in place of a number.
        logger.debug({ agentId, jid }, "Skipping history chat — JID did not resolve to a phone number")
        continue
      }

      const lastMsg = lastN[lastN.length - 1]
      const newest = new Date(tsOf(lastMsg) * 1000)
      const contactName =
        lastMsg.pushName ||
        chatNameByJid.get(jid) ||
        resolveContactName(agentId, phoneNumber) ||
        null

      let conversationId: string
      try {
        conversationId = await upsertConversationForHistory(
          agentId,
          phoneNumber,
          contactName,
          newest
        )
      } catch (err) {
        logger.warn({ err, agentId, phoneNumber }, "Failed to upsert history conversation")
        continue
      }
      conversationsTouched++

      for (const m of lastN) {
        const text = extractText(m.message as Record<string, unknown> | null)
        if (!text) continue
        const fromMe = m.key?.fromMe === true
        inserts.push({
          conversationId,
          direction: fromMe ? "outbound" : "inbound",
          // Pre-existing outbound messages weren't sent by us — attribute to a
          // human operator so they don't get billed/credited as AI sends.
          senderRole: fromMe ? "human" : "ai",
          content: text,
          createdAt: new Date(tsOf(m) * 1000),
        })
        messagesPrepared++
      }
    }

    let inserted = 0
    if (inserts.length > 0) {
      try {
        inserted = await bulkInsertHistoryMessages(inserts)
      } catch (err) {
        logger.error({ err, agentId, prepared: inserts.length }, "Failed to bulk-insert history messages")
      }
    }

    if (!firstEventHandled) {
      firstEventHandled = true
      try {
        await markSessionHistorySynced(agentId)
      } catch (err) {
        logger.warn({ err, agentId }, "Failed to mark session as history-synced")
      }
    }

    logger.info(
      {
        agentId,
        conversationsTouched,
        messagesPrepared,
        inserted,
        isLatest: isLatest ?? null,
      },
      "history sync chunk processed"
    )
  })
}

function normalizeTs(t: MaybeMessage["messageTimestamp"]): number {
  if (typeof t === "number") return t
  if (t && typeof t === "object" && "low" in t) return Number((t as { low: number }).low)
  return 0
}

// Extract plain text from any WhatsApp message — same surface area as the
// live messages.upsert handler. Kept local so changes to live extraction
// don't accidentally change history attribution.
function extractText(message: Record<string, unknown> | null | undefined): string | null {
  if (!message) return null

  const direct = extractFromMessage(message)
  if (direct) return direct

  const wrappers = [
    (message as Record<string, Record<string, unknown> | undefined>).ephemeralMessage?.message,
    (message as Record<string, Record<string, unknown> | undefined>).viewOnceMessage?.message,
    (message as Record<string, Record<string, Record<string, unknown> | undefined> | undefined>)
      .viewOnceMessageV2?.message,
    (message as Record<string, Record<string, Record<string, unknown> | undefined> | undefined>)
      .documentWithCaptionMessage?.message,
  ]
  for (const wrapped of wrappers) {
    if (!wrapped) continue
    const text = extractFromMessage(wrapped as Record<string, unknown>)
    if (text) return text
  }

  return null
}

interface TextBearingMessage {
  conversation?: string
  extendedTextMessage?: { text?: string }
  interactiveResponseMessage?: { body?: { text?: string } }
  imageMessage?: { caption?: string }
  videoMessage?: { caption?: string }
  documentMessage?: { caption?: string }
  buttonsResponseMessage?: { selectedDisplayText?: string }
  listResponseMessage?: { title?: string }
  templateButtonReplyMessage?: { selectedDisplayText?: string }
}

function extractFromMessage(m: Record<string, unknown>): string | null {
  const obj = m as TextBearingMessage
  const raw =
    obj.conversation ??
    obj.extendedTextMessage?.text ??
    obj.interactiveResponseMessage?.body?.text ??
    obj.imageMessage?.caption ??
    obj.videoMessage?.caption ??
    obj.documentMessage?.caption ??
    obj.buttonsResponseMessage?.selectedDisplayText ??
    obj.listResponseMessage?.title ??
    obj.templateButtonReplyMessage?.selectedDisplayText ??
    null

  return typeof raw === "string" && raw.length > 0 ? raw : null
}
