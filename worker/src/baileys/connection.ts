import {
  makeWASocket,
  DisconnectReason,
  makeCacheableSignalKeyStore,
  fetchLatestBaileysVersion,
  type WASocket,
  type AuthenticationState,
} from "@whiskeysockets/baileys"
import { Boom } from "@hapi/boom"
import { logger as rootLogger } from "../lib/logger.js"

export interface ConnectionOptions {
  agentId: string
  authState: AuthenticationState
  onQr: (qr: string) => void
  onConnected: (phoneNumber: string) => void
  onDisconnected: (reason: string, shouldReconnect: boolean) => void
  onBanned: () => void
  // When true, ask WhatsApp to push full chat history on link.
  // Caller is responsible for gating this to first-ever connect for the
  // session (we set it once via session-manager when the user has the
  // history-sync admin feature enabled and BaileysSession.historySyncedAt
  // is null).
  syncFullHistory?: boolean
}


export async function createConnection(opts: ConnectionOptions): Promise<WASocket> {
  const log = rootLogger.child({ agentId: opts.agentId })
  // Baileys is very chatty at INFO level (retry receipts, signal noise, etc.)
  // Use a WARN-only child so its internal logs don't flood the output
  const baileysLog = rootLogger.child({ agentId: opts.agentId, level: "warn" })

  const { version } = await fetchLatestBaileysVersion()
  log.info({ version }, "Using WhatsApp version")

  const sock = makeWASocket({
    auth: {
      creds: opts.authState.creds,
      keys: makeCacheableSignalKeyStore(opts.authState.keys, baileysLog as never),
    },
    logger: baileysLog as never,
    version,
    browser: ["Mac OS", "Chrome", "131.0.0"] as [string, string, string],
    connectTimeoutMs: 30_000,
    retryRequestDelayMs: 2_000,
    markOnlineOnConnect: false,
    defaultQueryTimeoutMs: undefined,
    syncFullHistory: opts.syncFullHistory ?? false,
  })

  // NOTE: creds.update is handled in session-manager.ts via saveCreds
  // Do NOT add a creds.update handler here

  sock.ev.on("connection.update", (update) => {
    const { connection, lastDisconnect, qr } = update

    if (qr) {
      log.info("QR code available")
      opts.onQr(qr)
    }

    if (connection === "open") {
      const phoneNumber = sock.user?.id?.split(":")[0] ?? "unknown"
      log.info({ phoneNumber }, "WhatsApp connected")
      opts.onConnected(phoneNumber)
    }

    if (connection === "close") {
      const err = lastDisconnect?.error as Boom | undefined
      const statusCode = err?.output?.statusCode

      // 403 = account banned/restricted by WhatsApp
      if (statusCode === 403) {
        log.warn({ statusCode }, "Session banned by WhatsApp")
        opts.onBanned()
        return
      }

      // 401 = session logged out (normal logout, pairing expired, replaced device)
      // Do not reconnect, but not a ban
      const shouldReconnect =
        statusCode !== DisconnectReason.loggedOut && // 401
        statusCode !== DisconnectReason.connectionReplaced // 440
      const reason = err?.message ?? `statusCode=${statusCode}`
      log.info({ reason, statusCode, shouldReconnect }, "Connection closed")
      opts.onDisconnected(reason, shouldReconnect)
    }
  })

  return sock
}
