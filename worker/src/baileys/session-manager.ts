import type { WASocket } from "baileys"
import { getEncryptedAuthState, purgeAuthFiles } from "./auth-store.js"
import { createConnection } from "./connection.js"
import { createEventHandlers } from "./event-handlers.js"
import { updateSessionStatus, upsertSession, deleteSession, getSessionByAgentId } from "../db/queries.js"
import { webhookEmitter } from "../dashboard/webhook-emitter.js"
import { logger as rootLogger } from "../lib/logger.js"
import { NotFoundError, SessionError } from "../lib/errors.js"

interface ActiveSession {
  sock: WASocket
  agentId: string
  qrCallbacks: Set<(qr: string, status: "qr" | "connected" | "disconnected") => void>
  reconnectTimer?: ReturnType<typeof setTimeout>
  reconnectAttempts: number
  paused: boolean // anti-ban reactive pause
}

const sessions = new Map<string, ActiveSession>()
const logger = rootLogger.child({ module: "session-manager" })

const MAX_RECONNECT_ATTEMPTS = 5
const RECONNECT_BASE_DELAY_MS = 5_000

export const sessionManager = {
  async create(agentId: string): Promise<{ agentId: string; status: string }> {
    if (sessions.has(agentId)) {
      return { agentId, status: "already_active" }
    }
    await upsertSession(agentId, { status: "QR_PENDING" })
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

  async destroy(agentId: string): Promise<void> {
    const active = sessions.get(agentId)
    if (active) {
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
      await updateSessionStatus(agentId, "CONNECTED", {
        phoneNumber,
        lastConnectedAt: new Date().toISOString(),
        warmupStartedAt: (await getSessionByAgentId(agentId))?.warmupStartedAt ?? new Date().toISOString(),
      })
      webhookEmitter.emit("session.connected", { agentId, phoneNumber })
    },

    onDisconnected: async (reason, shouldReconnect) => {
      active.qrCallbacks.forEach((cb) => cb("", "disconnected"))
      await updateSessionStatus(agentId, "DISCONNECTED", { lastDisconnectReason: reason })
      webhookEmitter.emit("session.disconnected", { agentId, reason })

      if (!shouldReconnect) {
        // Purge stale auth files so the next connect starts fresh
        await purgeAuthFiles(agentId)
        sessions.delete(agentId)
        return
      }
      if (reconnectAttempt >= MAX_RECONNECT_ATTEMPTS) {
        logger.error({ agentId }, "Max reconnect attempts reached")
        return
      }

      const delay = RECONNECT_BASE_DELAY_MS * 2 ** reconnectAttempt
      logger.info({ agentId, delay }, "Scheduling reconnect")
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

  // Attach inbound message handlers
  createEventHandlers(sock, agentId)
}
