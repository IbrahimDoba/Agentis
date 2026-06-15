import type { WASocket } from "@whiskeysockets/baileys"
import { sessionManager } from "../baileys/session-manager.js"
import { trackedAgents, getLastInboundAt, markInboundActivity } from "../baileys/activity-tracker.js"
import { logger as rootLogger } from "../lib/logger.js"

const logger = rootLogger.child({ module: "deaf-session-watchdog" })

// Probe cadence + thresholds for the "deaf session" detector.
const SWEEP_INTERVAL_MS = 90 * 1000        // how often to evaluate sessions
const SILENT_THRESHOLD_MS = 10 * 60 * 1000 // no message events for 10 min = suspicious
const PROBE_TIMEOUT_MS = 12 * 1000         // a probe that takes longer = receive pipeline jammed

let timer: ReturnType<typeof setInterval> | undefined

// Active liveness probe. A deaf session (jammed receive/ACK pipeline) can't
// answer queries either, so a hung onWhatsApp reliably distinguishes "dead"
// from "just quiet" — without it, a bare silence timer would force needless
// restarts during low-traffic periods.
async function probeAlive(sock: WASocket): Promise<boolean> {
  const id = sock.user?.id
  if (!id) return false
  const phone = id.split(":")[0].split("@")[0]
  try {
    const res = await Promise.race([
      sock.onWhatsApp(phone),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("probe timeout")), PROBE_TIMEOUT_MS)),
    ])
    return Array.isArray(res)
  } catch {
    return false
  }
}

async function sweep(): Promise<void> {
  for (const agentId of trackedAgents()) {
    const sock = sessionManager.get(agentId)
    if (!sock) continue // not connected in this process — the reconnect watchdog handles those

    const last = getLastInboundAt(agentId)
    if (last === undefined || Date.now() - last < SILENT_THRESHOLD_MS) continue // active enough

    const alive = await probeAlive(sock)
    if (alive) {
      // Just a quiet stretch — refresh so we don't probe again next sweep.
      markInboundActivity(agentId)
      continue
    }

    logger.warn(
      { agentId, silentMs: Date.now() - last },
      "Deaf session detected (connected but silent + probe failed) — forcing reconnect"
    )
    try {
      await sessionManager.restart(agentId)
    } catch (err) {
      logger.error({ err, agentId }, "Deaf-session watchdog: restart failed")
    }
  }
}

export function startDeafSessionWatchdog(): void {
  if (timer) return
  timer = setInterval(() => {
    void sweep()
  }, SWEEP_INTERVAL_MS)
  if (typeof timer.unref === "function") timer.unref()
  logger.info({ intervalMs: SWEEP_INTERVAL_MS, silentThresholdMs: SILENT_THRESHOLD_MS }, "Deaf-session watchdog started")
}

export function stopDeafSessionWatchdog(): void {
  if (timer) {
    clearInterval(timer)
    timer = undefined
  }
}
