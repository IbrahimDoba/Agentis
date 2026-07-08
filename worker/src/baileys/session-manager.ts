import type { WASocket } from "@whiskeysockets/baileys"
import { getEncryptedAuthState, purgeAuthFiles } from "./auth-store.js"
import { createConnection } from "./connection.js"
import { createEventHandlers } from "./event-handlers.js"
import { attachHistorySyncHandler } from "./history-sync.js"
import { attachLabelHandlers } from "./labels.js"
import { importProfileFromWhatsApp } from "./profile-import.js"
import { updateContacts, setLidMappingStore } from "./contacts-store.js"
import { updateSessionStatus, upsertSession, deleteSession, getSessionByAgentId, getHistorySyncStatus } from "../db/queries.js"
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
  // True once this socket has emitted its first QR — i.e. the WebSocket + noise
  // handshake completed and WhatsApp sent pair-device refs. The server only
  // accepts requestPairingCode from that point; the dashboard calls create()
  // then pairing-code back-to-back, so an immediate request races the handshake
  // and fails (the "worked once, never again" pairing bug).
  qrReady: boolean
}

const sessions = new Map<string, ActiveSession>()
const logger = rootLogger.child({ module: "session-manager" })

const RECONNECT_BASE_DELAY_MS = 5_000
const MAX_RECONNECT_DELAY_MS = 120_000
// Reconnect cap lives in reconnect-policy.ts so it can be unit-tested without
// importing Baileys (which pulls in native libsignal).
import { MAX_RECONNECT_ATTEMPTS, shouldRetryReconnect } from "./reconnect-policy.js"

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
    const digits = phoneNumber.replace(/\D/g, "")
    // Baileys encodes this straight into a JID — a local-format number (no
    // country code) produces an invalid JID and a code that can never link.
    if (digits.length < 10) {
      throw new SessionError("Enter the full number with country code, e.g. 2348012345678")
    }

    // Wait until the CURRENT socket is pairing-ready (first QR emitted = noise
    // handshake done + pair-device refs received). Re-fetch the session every
    // tick: auto-reconnect replaces the ActiveSession object under us, and a
    // fresh socket starts with qrReady=false until its own QR arrives.
    const waitForReady = async (timeoutMs: number): Promise<ActiveSession> => {
      const deadline = Date.now() + timeoutMs
      for (;;) {
        const current = sessions.get(agentId)
        if (!current) throw new SessionError("Session not started — call create first")
        if (current.sock.authState.creds.registered) {
          throw new SessionError("Already registered — pairing code not needed")
        }
        if (current.qrReady) return current
        if (Date.now() > deadline) {
          throw new SessionError("WhatsApp connection not ready yet — try again in a few seconds")
        }
        await new Promise((r) => setTimeout(r, 500))
      }
    }

    // Timeouts sized so even the retry path stays under the dashboard's
    // serverless proxy timeout (QR normally arrives 1–3s after create()).
    let active = await waitForReady(20_000)
    try {
      const code = await active.sock.requestPairingCode(digits)
      logger.info({ agentId, digits }, "Pairing code requested")
      return code
    } catch (err) {
      // The socket can die between its QR and our request (QR refs exhausted →
      // close → auto-reconnect). Retry ONCE against the freshest socket after
      // it becomes ready — its qrReady flag resets until its own QR arrives.
      logger.warn({ agentId, err: (err as Error)?.message }, "Pairing code request failed — retrying on a fresh socket")
      await new Promise((r) => setTimeout(r, 2_000))
      active = await waitForReady(15_000)
      const code = await active.sock.requestPairingCode(digits)
      logger.info({ agentId, digits, retried: true }, "Pairing code requested")
      return code
    }
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

  // Admin-gated chat-history-on-link feature: only request a full history
  // pull when the agent's owning user has the toggle on AND this session
  // hasn't already been synced once. Reconnects of an already-synced session
  // skip the full pull regardless of the user flag.
  let syncFullHistory = false
  try {
    const status = await getHistorySyncStatus(agentId)
    syncFullHistory = status.userEnabled && !status.alreadySynced
    if (syncFullHistory) {
      logger.info({ agentId }, "History sync enabled for this connect — requesting full chat history")
    }
  } catch (err) {
    logger.warn({ err, agentId }, "Failed to read history sync status — defaulting to off")
  }

  const active: ActiveSession = {
    sock: null as never, // assigned below
    agentId,
    qrCallbacks: new Set(),
    reconnectAttempts: reconnectAttempt,
    paused: false,
    stopRequested: false,
    qrReady: false,
  }
  sessions.set(agentId, active)

  const sock = await createConnection({
    agentId,
    authState: { creds: state.creds, keys: state.keys },
    syncFullHistory,

    onQr: async (qr) => {
      // Handshake complete + pair-device refs received — the socket can now
      // accept requestPairingCode (see sessionManager.requestPairingCode).
      active.qrReady = true
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

      // Fire-and-forget profile import on first connect. Internally guarded
      // by Agent.autoConfigStartedAt — re-connects after the first one are
      // no-ops, so this is safe to call on every connect event.
      importProfileFromWhatsApp(active.sock, agentId).catch((err) => {
        logger.warn({ agentId, err: err.message }, "Profile import failed (non-fatal)")
      })
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
      if (!shouldRetryReconnect(reconnectAttempt)) {
        // Cap reached — stop the retry loop. The session row keeps DISCONNECTED
        // status with a clear reason; the dashboard can manually restart.
        await updateSessionStatus(agentId, "DISCONNECTED", {
          lastDisconnectReason: "max_reconnect_attempts_exceeded",
        })
        logger.warn(
          { agentId, reconnectAttempt, max: MAX_RECONNECT_ATTEMPTS, lastReason: reason },
          "Hit reconnect-attempt cap — giving up. Restart manually from dashboard."
        )
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

  // Always attach the history-sync handler. WhatsApp sends a small amount
  // of history on every new link even when syncFullHistory is false, and
  // the auto-configure pipeline needs whatever it can get. The syncFullHistory
  // flag above only controls whether we ASK for a full pull — we still want
  // to process the limited recent history we receive by default.
  attachHistorySyncHandler(sock, agentId)

  // Mirror WhatsApp Business labels (created/applied on the phone) into our DB
  // so the dashboard + AI can see and use them. WhatsApp Business accounts only.
  attachLabelHandlers(sock, agentId)
}
