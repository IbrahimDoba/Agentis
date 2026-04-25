import type { WASocket } from "@whiskeysockets/baileys"
import { getEncryptedAuthState, purgeAuthFiles } from "./auth-store.js"
import { createConnection } from "./connection.js"
import { createEventHandlers } from "./event-handlers.js"
import { updateContacts, setLidMappingStore } from "./contacts-store.js"
import { updateSessionStatus, upsertSession, deleteSession, getSessionByAgentId } from "../db/queries.js"
import { webhookEmitter } from "../dashboard/webhook-emitter.js"
import { logger as rootLogger } from "../lib/logger.js"
import { NotFoundError, SessionError } from "../lib/errors.js"
import { shouldAdvanceTier } from "../anti-ban/warmup.js"
import { resetErrors } from "../anti-ban/throttle-detector.js"

interface ActiveSession {
  sock: WASocket
  agentId: string
  qrCallbacks: Set<(qr: string, status: "qr" | "connected" | "disconnected") => void>
  reconnectTimer?: ReturnType<typeof setTimeout>
  reconnectAttempts: number
  paused: boolean // anti-ban reactive pause
  stopRequested: boolean // true when user intentionally disconnects/restarts/destroys
}

const sessions = new Map<string, ActiveSession>()
const logger = rootLogger.child({ module: "session-manager" })

const RECONNECT_BASE_DELAY_MS = 5_000
const MAX_RECONNECT_DELAY_MS = 120_000

export const sessionManager = {
  async create(agentId: string, initialTier?: number): Promise<{ agentId: string; status: string }> {
    if (sessions.has(agentId)) {
      return { agentId, status: "already_active" }
    }
    const tierFields = initialTier && initialTier >= 1 && initialTier <= 4
      ? { warmupTier: initialTier, warmupStartedAt: new Date().toISOString() }
      : {}
    await upsertSession(agentId, { status: "QR_PENDING", ...tierFields })
    await startSession(agentId)
    return { agentId, status: "qr_pending" }
  },

  async requestPairingCode(agentId: string, phoneNumber: string): Promise<string> {
    const active = sessions.get(agentId)
    if (!active) throw new SessionError("Session not started — call create first")
    if (active.sock.authState.creds.registered) {
      throw new SessionError("Already registered — pairing code not needed")
    }
    const digits = phoneNumber.replace(/\D/g, "")
    const code = await active.sock.requestPairingCode(digits)
    logger.info({ agentId, digits }, "Pairing code requested")
    return code
  },

  // Disconnect: stops the socket and marks DISCONNECTED — preserves auth files + DB record
  async disconnect(agentId: string): Promise<void> {
    const active = sessions.get(agentId)
    if (active) {
      active.stopRequested = true
      clearTimeout(active.reconnectTimer)
      try { active.sock.end(undefined) } catch { /* ignore */ }
      sessions.delete(agentId)
    }
    await updateSessionStatus(agentId, "DISCONNECTED")
    logger.info({ agentId }, "Session disconnected (auth preserved)")
  },

  // Destroy: full wipe — logout from WhatsApp, delete auth files + DB record
  async destroy(agentId: string): Promise<void> {
    const active = sessions.get(agentId)
    if (active) {
      active.stopRequested = true
      clearTimeout(active.reconnectTimer)
      try {
        await active.sock.logout()
      } catch {
        // Already disconnected — that's fine
      }
      sessions.delete(agentId)
    }
    await purgeAuthFiles(agentId)
    await deleteSession(agentId)
    logger.info({ agentId }, "Session destroyed")
  },

  async restart(agentId: string): Promise<void> {
    const active = sessions.get(agentId)
    if (active) {
      active.stopRequested = true
      clearTimeout(active.reconnectTimer)
      try { active.sock.end(undefined) } catch { /* ignore */ }
      sessions.delete(agentId)
    }
    await startSession(agentId)
  },

  get(agentId: string): WASocket | null {
    return sessions.get(agentId)?.sock ?? null
  },

  isPaused(agentId: string): boolean {
    return sessions.get(agentId)?.paused ?? false
  },

  pause(agentId: string): void {
    const s = sessions.get(agentId)
    if (s) {
      s.paused = true
      logger.warn({ agentId }, "Session outbound paused (anti-ban)")
    }
  },

  resume(agentId: string): void {
    const s = sessions.get(agentId)
    if (s) {
      s.paused = false
      logger.info({ agentId }, "Session outbound resumed")
    }
  },

  subscribeToQr(
    agentId: string,
    cb: (qr: string, status: "qr" | "connected" | "disconnected") => void
  ): () => void {
    let active = sessions.get(agentId)
    if (!active) {
      cb("", "disconnected")
      return () => {}
    }
    active.qrCallbacks.add(cb)
    return () => active?.qrCallbacks.delete(cb)
  },
}

async function startSession(agentId: string, reconnectAttempt = 0): Promise<void> {
  logger.info({ agentId, reconnectAttempt }, "Starting Baileys session")

  const { state, saveCreds } = await getEncryptedAuthState(agentId)

  const active: ActiveSession = {
    sock: null as never, // assigned below
    agentId,
    qrCallbacks: new Set(),
    reconnectAttempts: reconnectAttempt,
    paused: false,
    stopRequested: false,
  }
  sessions.set(agentId, active)

  const sock = await createConnection({
    agentId,
    authState: { creds: state.creds, keys: state.keys },

    onQr: async (qr) => {
      active.qrCallbacks.forEach((cb) => cb(qr, "qr"))
      await updateSessionStatus(agentId, "QR_PENDING")
      webhookEmitter.emit("session.qr", { agentId, qr })
    },

    onConnected: async (phoneNumber) => {
      active.reconnectAttempts = 0
      active.qrCallbacks.forEach((cb) => cb("", "connected"))
      const existing = await getSessionByAgentId(agentId)
      const warmupStartedAt = existing?.warmupStartedAt ?? new Date().toISOString()
      let warmupTier = existing?.warmupTier ?? 1
      // Advance tier if enough days have passed
      while (warmupTier < 4 && shouldAdvanceTier(warmupTier, new Date(warmupStartedAt))) {
        warmupTier++
        logger.info({ agentId, warmupTier }, "Warmup tier advanced")
      }
      await updateSessionStatus(agentId, "CONNECTED", {
        phoneNumber,
        lastConnectedAt: new Date().toISOString(),
        warmupStartedAt,
        warmupTier,
      })
      // Clear any throttle error state and un-pause from previous connection issues
      resetErrors(agentId)
      if (active.paused) {
        active.paused = false
        logger.info({ agentId }, "Session outbound auto-resumed on reconnect")
      }
      webhookEmitter.emit("session.connected", { agentId, phoneNumber })
    },

    onDisconnected: async (reason, shouldReconnect) => {
      if (active.stopRequested) {
        logger.info({ agentId, reason }, "Session close was intentional — skipping auto-reconnect")
        return
      }

      active.qrCallbacks.forEach((cb) => cb("", "disconnected"))
      await updateSessionStatus(agentId, "DISCONNECTED", { lastDisconnectReason: reason })
      webhookEmitter.emit("session.disconnected", { agentId, reason })

      if (!shouldReconnect) {
        // Purge stale auth files so the next connect starts fresh
        await purgeAuthFiles(agentId)
        sessions.delete(agentId)
        return
      }
      const delay = Math.min(
        RECONNECT_BASE_DELAY_MS * 2 ** reconnectAttempt,
        MAX_RECONNECT_DELAY_MS
      )
      await updateSessionStatus(agentId, "CONNECTING", { lastDisconnectReason: reason })
      logger.info({ agentId, delay, reconnectAttempt }, "Scheduling auto-reconnect")
      active.reconnectTimer = setTimeout(() => {
        sessions.delete(agentId)
        startSession(agentId, reconnectAttempt + 1)
      }, delay)
    },

    onBanned: async () => {
      active.qrCallbacks.forEach((cb) => cb("", "disconnected"))
      await updateSessionStatus(agentId, "BANNED")
      webhookEmitter.emit("session.banned", { agentId })
      sessions.delete(agentId)
    },
  })

  active.sock = sock
  sock.ev.on("creds.update", saveCreds)

  // Wire up Baileys' built-in LID↔PN mapping store
  const lidRepo = (sock as unknown as Record<string, unknown>).signalRepository as Record<string, unknown> | undefined
  if (lidRepo?.lidMapping) {
    setLidMappingStore(lidRepo.lidMapping as { getPNForLID?: (lid: string) => string | undefined })
  }

  // Build LID → phone number mapping so we can resolve privacy JIDs
  sock.ev.on("contacts.upsert", (contacts) => {
    // Log only contacts that have lid info — these are the mappings we need
    const lidContacts = contacts.filter((c) =>
      (c.id as string | undefined)?.endsWith("@lid") || Boolean((c as any).lid)
    )
    logger.info({ agentId, total: contacts.length, lidContacts: JSON.stringify(lidContacts.slice(0, 10)) }, "contacts.upsert fired")
    updateContacts(agentId, contacts)
  })
  sock.ev.on("contacts.update", (updates) => {
    const lidUpdates = updates.filter((c) =>
      (c.id as string | undefined)?.endsWith("@lid") || Boolean((c as any).lid)
    )
    if (lidUpdates.length > 0) {
      logger.info({ agentId, lidUpdates: JSON.stringify(lidUpdates) }, "contacts.update with LID")
    }
    updateContacts(agentId, updates)
  })

  // Attach inbound message handlers
  createEventHandlers(sock, agentId)
}
