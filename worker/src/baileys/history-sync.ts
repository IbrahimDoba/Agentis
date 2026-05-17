import type { WASocket } from "@whiskeysockets/baileys"
import { mkdir, writeFile } from "fs/promises"
import { join, resolve } from "path"
import { logger as rootLogger } from "../lib/logger.js"
import {
  bulkInsertHistoryMessages,
  markSessionHistorySynced,
  upsertConversationForHistory,
  type HistoryMessageInsert,
} from "../db/queries.js"
import { resolvePhone, resolveContactName, updateContacts } from "./contacts-store.js"
import { extractChatsForAutoConfig } from "./chat-extractor.js"

// Snapshots live OUTSIDE auth_sessions/ so the auth-store's
// encryptLocalFiles loop (which walks auth_sessions/<agentId>/) doesn't
// trip on a directory entry with EISDIR. They also stay out of the
// Supabase auth-backup upload, where they don't belong.
const SNAPSHOT_BASE = resolve("history_snapshots")

// Write the raw `messaging-history.set` payload to disk before we try to
// process it. WhatsApp only delivers history once per device-link; if our
// bulk-insert or anything else throws, the chunk is otherwise lost forever.
// With a snapshot on disk we can replay extraction later without forcing
// the user to re-link WhatsApp.
async function snapshotPayload(
  agentId: string,
  payload: unknown,
  index: number
): Promise<void> {
  try {
    const dir = join(SNAPSHOT_BASE, agentId)
    await mkdir(dir, { recursive: true })
    const file = join(dir, `chunk-${Date.now()}-${index}.json`)
    await writeFile(file, JSON.stringify(payload), "utf-8")
  } catch {
    // Never fail the main flow because of a snapshot write — we're best-effort.
  }
}

// Per-agent state. WhatsApp's `isLatest` flag is unreliable AND chunks can
// take 30-60s to bulk-insert. We track both "in-flight" chunks and "last
// activity" so:
//   - the debounced extractor waits for chunks to stop arriving AND for all
//     in-flight processing to finish before running.
//   - the POST /extract-chats route can do the same wait (see
//     waitForHistorySyncToSettle below).
const EXTRACT_DEBOUNCE_MS = 5_000
const extractTimers = new Map<string, NodeJS.Timeout>()
const pendingChunks = new Map<string, number>()
const lastActivityAt = new Map<string, number>()

function incrementPending(agentId: string): void {
  pendingChunks.set(agentId, (pendingChunks.get(agentId) ?? 0) + 1)
  lastActivityAt.set(agentId, Date.now())
}
function decrementPending(agentId: string): void {
  const next = Math.max(0, (pendingChunks.get(agentId) ?? 1) - 1)
  pendingChunks.set(agentId, next)
  lastActivityAt.set(agentId, Date.now())
}

function scheduleExtraction(agentId: string, run: () => Promise<unknown>) {
  const existing = extractTimers.get(agentId)
  if (existing) clearTimeout(existing)
  const t = setTimeout(() => {
    extractTimers.delete(agentId)
    // If chunks are still being processed, re-arm and try again. Otherwise
    // we'd run extraction against a half-persisted dataset.
    if ((pendingChunks.get(agentId) ?? 0) > 0) {
      scheduleExtraction(agentId, run)
      return
    }
    run().catch(() => { /* logged by caller */ })
  }, EXTRACT_DEBOUNCE_MS)
  extractTimers.set(agentId, t)
}

// Wait until history sync has settled — no in-flight chunks and no new chunk
// has arrived for QUIET_MS. Used by the POST /extract-chats route so the
// user-triggered extract doesn't race the still-running history sync.
export async function waitForHistorySyncToSettle(
  agentId: string,
  options: { quietMs?: number; maxWaitMs?: number } = {}
): Promise<{ waited: number; pendingOnExit: number }> {
  const quietMs = options.quietMs ?? 5_000
  const maxWaitMs = options.maxWaitMs ?? 90_000
  const start = Date.now()
  while (Date.now() - start < maxWaitMs) {
    const pending = pendingChunks.get(agentId) ?? 0
    const lastAt = lastActivityAt.get(agentId)
    const quiet = lastAt === undefined || Date.now() - lastAt > quietMs
    if (pending === 0 && quiet) {
      return { waited: Date.now() - start, pendingOnExit: 0 }
    }
    await new Promise((r) => setTimeout(r, 500))
  }
  return { waited: Date.now() - start, pendingOnExit: pendingChunks.get(agentId) ?? 0 }
}

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
  let chunkIndex = 0

  sock.ev.on("messaging-history.set", async (payload) => {
    incrementPending(agentId)
    try {
    // Snapshot the raw payload BEFORE any processing. WhatsApp won't ever
    // re-send this data without a full unlink+re-link, so if our DB code
    // throws here we want a recovery file we can replay later.
    await snapshotPayload(agentId, payload, chunkIndex++)

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
      // Prefer the pushName from an inbound message — that's the customer's
      // name as they have it set. lastMsg may be an outbound (us) where
      // pushName is the operator. Fall back to chat name, then any cached
      // contact name from contacts-store.
      const inboundWithName = lastN.find((m) => m.key?.fromMe !== true && m.pushName)
      const contactName =
        inboundWithName?.pushName ||
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
          waMessageId: m.key?.id ?? null,
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

    // Schedule chat extraction with a 5s debounce. The scheduler also
    // re-checks pendingChunks at fire time and re-arms if any chunks are
    // still mid-flight (bulk insert can take 30-60s).
    scheduleExtraction(agentId, () =>
      extractChatsForAutoConfig(agentId).catch((err) => {
        logger.warn({ err, agentId }, "Chat extraction after history sync failed")
      })
    )
    } finally {
      decrementPending(agentId)
    }
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
