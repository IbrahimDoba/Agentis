import makeWASocket, {
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  type WASocket,
  type AuthenticationState,
} from "baileys"
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

  const sock = makeWASocket({
    version,
    auth: {
      creds: opts.authState.creds,
      keys: makeCacheableSignalKeyStore(opts.authState.keys, log as never),
    },
    printQRInTerminal: false,
    logger: log as never,
    browser: ["Dailzero AI", "Chrome", "1.0.0"],
    connectTimeoutMs: 30_000,
    retryRequestDelayMs: 2_000,
    markOnlineOnConnect: false, // avoid unnecessary online presence broadcasts
  })

  sock.ev.on("creds.update", opts.authState.keys.set as never)

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

      // Permanent errors — do not reconnect
      const banned =
        statusCode === 401 ||
        statusCode === 403 ||
        err?.output?.payload?.error === "loggedOut"

      if (banned) {
        log.warn({ statusCode }, "Session appears banned/logged out")
        opts.onBanned()
        return
      }

      const shouldReconnect = statusCode !== DisconnectReason.loggedOut
      const reason = err?.message ?? `statusCode=${statusCode}`
      log.info({ reason, shouldReconnect }, "Connection closed")
      opts.onDisconnected(reason, shouldReconnect)
    }
  })

  return sock
}
