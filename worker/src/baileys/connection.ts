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
}


export async function createConnection(opts: ConnectionOptions): Promise<WASocket> {
  const log = rootLogger.child({ agentId: opts.agentId })

  const { version } = await fetchLatestBaileysVersion()
  log.info({ version }, "Using WhatsApp version")

  const sock = makeWASocket({
    auth: {
      creds: opts.authState.creds,
      keys: makeCacheableSignalKeyStore(opts.authState.keys, log as never),
    },
    logger: log as never,
    version,
    browser: ["Mac OS", "Chrome", "131.0.0"] as [string, string, string],
    connectTimeoutMs: 30_000,
    retryRequestDelayMs: 2_000,
    markOnlineOnConnect: false,
    defaultQueryTimeoutMs: undefined,
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
