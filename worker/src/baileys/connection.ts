import {
  makeWASocket,
  DisconnectReason,
  makeCacheableSignalKeyStore,
  Browsers,
  fetchLatestWaWebVersion,
  type WASocket,
  type AuthenticationState,
  type CacheStore,
} from "@whiskeysockets/baileys"
import { Boom } from "@hapi/boom"
import { logger as rootLogger } from "../lib/logger.js"
import { recordEvent } from "../lib/event-log.js"

// Bounded in-memory cache for Baileys' message-retry counters. Baileys needs a
// msgRetryCounterCache to ENFORCE maxMsgRetryCount — without one the counter is
// never tracked, so a recipient on a flaky connection that keeps sending
// "retry receipts" (couldn't decrypt) makes Baileys resend the SAME message
// over and over. The result: one send in our DB, but the customer receives the
// reply 2-3× (WhiskeySockets/Baileys#853). This caps that.
function makeRetryCounterCache(): CacheStore {
  const store = new Map<string, { v: unknown; exp: number }>()
  const TTL_MS = 5 * 60_000
  const prune = () => {
    const now = Date.now()
    for (const [k, e] of store) if (e.exp < now) store.delete(k)
  }
  return {
    get<T>(key: string): T | undefined {
      const e = store.get(key)
      if (!e) return undefined
      if (e.exp < Date.now()) { store.delete(key); return undefined }
      return e.v as T
    },
    set<T>(key: string, value: T): void {
      if (store.size > 10_000) prune()
      store.set(key, { v: value, exp: Date.now() + TTL_MS })
    },
    del(key: string): void { store.delete(key) },
    flushAll(): void { store.clear() },
  }
}

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


// WhatsApp's servers reject NEW device links (QR and pairing code) from clients
// announcing a stale WA Web version — rc13's bundled default is already stale
// ("Couldn't link device", Baileys #2679). fetchLatestWaWebVersion() reads the
// REAL current version from web.whatsapp.com (unlike fetchLatestBaileysVersion,
// which returns the same stale pin). Cache it for 6h and fall back to the
// bundled default if the fetch fails, so a web.whatsapp.com hiccup can't stop
// sessions from starting.
let cachedWaVersion: { version: [number, number, number]; fetchedAt: number } | null = null
const WA_VERSION_TTL_MS = 6 * 60 * 60 * 1000

async function resolveWaWebVersion(): Promise<[number, number, number] | undefined> {
  if (cachedWaVersion && Date.now() - cachedWaVersion.fetchedAt < WA_VERSION_TTL_MS) {
    return cachedWaVersion.version
  }
  try {
    const { version } = await fetchLatestWaWebVersion({})
    cachedWaVersion = { version: version as [number, number, number], fetchedAt: Date.now() }
    rootLogger.info({ version }, "Using latest WA Web version")
    return cachedWaVersion.version
  } catch (err) {
    rootLogger.warn({ err: (err as Error)?.message }, "Failed to fetch latest WA Web version — using bundled default")
    return undefined
  }
}

export async function createConnection(opts: ConnectionOptions): Promise<WASocket> {
  const log = rootLogger.child({ agentId: opts.agentId })
  // Baileys is very chatty at INFO level (retry receipts, signal noise, etc.)
  // Use a WARN-only child so its internal logs don't flood the output
  const baileysLog = rootLogger.child({ agentId: opts.agentId, level: "warn" })

  const waVersion = await resolveWaWebVersion()

  const sock = makeWASocket({
    ...(waVersion ? { version: waVersion } : {}),
    auth: {
      creds: opts.authState.creds,
      keys: makeCacheableSignalKeyStore(opts.authState.keys, baileysLog as never),
    },
    logger: baileysLog as never,
    browser: Browsers.macOS("Chrome"),
    connectTimeoutMs: 30_000,
    retryRequestDelayMs: 2_000,
    // Cap message-retry resends so a flaky recipient can't make us deliver the
    // same reply many times (see makeRetryCounterCache above). The cache ENFORCES
    // the cap; without it the count was never tracked and resends ran unbounded.
    msgRetryCounterCache: makeRetryCounterCache(),
    // At most ONE resend attempt per message. On a broken signal session the
    // recipient can send retry receipts in a loop; anything higher lets a single
    // reply be delivered dozens+ of times.
    maxMsgRetryCount: 1,
    // getMessage is what Baileys calls to RE-fetch a message body to resend when
    // a recipient asks for a retry. We intentionally return undefined: we do NOT
    // keep a resend store, and — critically — declining the resend is what stops
    // the retry-storm duplicate deliveries (one reply arriving 100× on a broken
    // session). The first send still goes out normally; only broken-session
    // resends are declined. See WhiskeySockets/Baileys#853.
    getMessage: async () => undefined,
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
        void recordEvent({ level: "error", category: "session.banned", agentId: opts.agentId, message: "Session banned by WhatsApp", detail: { statusCode } })
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
      // Record the closure so connection failures (QR expiry, WhatsApp <failure>
      // rejections, etc.) are diagnosable from the DB — including the status code
      // we otherwise only see in the Railway logs.
      void recordEvent({ level: "warn", category: "session.closed", agentId: opts.agentId, message: reason, detail: { statusCode, shouldReconnect } })
      opts.onDisconnected(reason, shouldReconnect)
    }
  })

  return sock
}
