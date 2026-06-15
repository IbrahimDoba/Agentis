import {
  makeWASocket,
  DisconnectReason,
  makeCacheableSignalKeyStore,
  Browsers,
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

  // Per Baileys docs: do NOT pin/fetch the WhatsApp version per connection —
  // "avoid setting latest version each connection to prevent incompatibility".
  // Letting Baileys use the version it bundles (and was tested against) is more
  // stable than fetchLatestBaileysVersion(), which can return a web version the
  // installed Baileys protocol can't actually handle — a common cause of
  // "scan succeeds but the device never links."
  const sock = makeWASocket({
    auth: {
      creds: opts.authState.creds,
      keys: makeCacheableSignalKeyStore(opts.authState.keys, baileysLog as never),
    },
    logger: baileysLog as never,
    browser: Browsers.macOS("Chrome"),
    connectTimeoutMs: 30_000,
    retryRequestDelayMs: 2_000,
    markOnlineOnConnect: false,
    // v7 "deaf session" hardening:
    // - A real 60s query timeout instead of `undefined` (= no timeout). With no
    //   timeout, an internal query during message-decrypt can hang forever and
    //   jam the receive pipeline so messages.upsert silently stops firing.
    // - Tighter keepalive so a transport-dead socket is noticed sooner.
    defaultQueryTimeoutMs: 60_000,
    keepAliveIntervalMs: 15_000,
    syncFullHistory: opts.syncFullHistory ?? false,
    // In v7 a missing callback defaults to `() => syncFullHistory`, so with
    // syncFullHistory=false it blocks even the lightweight INITIAL_BOOTSTRAP/
    // RECENT syncs — which carry LID/routing data inbound messages need. Allow
    // those; gate only the heavy FULL sync (syncType 2) behind syncFullHistory.
    shouldSyncHistoryMessage: (msg) => msg.syncType !== 2 || (opts.syncFullHistory ?? false),
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
