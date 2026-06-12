import { sessionManager } from "../baileys/session-manager.js"
import { getStuckSessions } from "../db/queries.js"
import { logger as rootLogger } from "../lib/logger.js"

const logger = rootLogger.child({ module: "session-watchdog" })

// How often to look for sessions that gave up reconnecting. The worker burns
// ~10 reconnect attempts (~10–15 min) before giving up, so a 3-min sweep revives
// a stuck session within minutes of it going dead.
const SWEEP_INTERVAL_MS = 3 * 60 * 1000

let timer: ReturnType<typeof setInterval> | undefined

// Auto-revive any session that hit the reconnect-attempt cap and is sitting
// DISCONNECTED. sessionManager.restart() re-runs startSession, which restores
// the auth from the Supabase backup and reconnects — so a stuck session
// self-heals in minutes instead of sitting dead (dropping every inbound) until
// a human notices and restarts it from the dashboard.
async function sweep(): Promise<void> {
  let stuck: { agentId: string }[]
  try {
    stuck = await getStuckSessions()
  } catch (err) {
    logger.error({ err }, "Watchdog: failed to query stuck sessions")
    return
  }
  if (stuck.length === 0) return

  for (const { agentId } of stuck) {
    // Already has a live socket in this process — nothing to do.
    if (sessionManager.get(agentId)) continue
    logger.warn({ agentId }, "Watchdog: reviving session that gave up reconnecting")
    try {
      await sessionManager.restart(agentId)
    } catch (err) {
      logger.error({ err, agentId }, "Watchdog: restart failed")
    }
  }
}

export function startSessionWatchdog(): void {
  if (timer) return
  timer = setInterval(() => {
    void sweep()
  }, SWEEP_INTERVAL_MS)
  if (typeof timer.unref === "function") timer.unref()
  logger.info({ intervalMs: SWEEP_INTERVAL_MS }, "Session watchdog started")
}

export function stopSessionWatchdog(): void {
  if (timer) {
    clearInterval(timer)
    timer = undefined
  }
}
