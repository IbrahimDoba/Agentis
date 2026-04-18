import { sessionManager } from "../baileys/session-manager.js"
import { logger as rootLogger } from "../lib/logger.js"

const logger = rootLogger.child({ module: "throttle-detector" })

const COOLDOWN_MS = 10 * 60 * 1000 // 10 minutes

// Track consecutive failed acks per session
const failedAcks = new Map<string, number>()
const recentErrors = new Map<string, { count: number; windowStart: number }>()

/**
 * §7.5 — Called when a message fails to send or ack times out.
 * After 3+ errors in 60s, or 5+ consecutive ack failures, pause the session.
 */
export function recordSendError(agentId: string): void {
  const now = Date.now()
  const window = recentErrors.get(agentId) ?? { count: 0, windowStart: now }

  if (now - window.windowStart > 60_000) {
    window.count = 1
    window.windowStart = now
  } else {
    window.count++
  }
  recentErrors.set(agentId, window)

  if (window.count >= 3) {
    triggerPause(agentId, "3+ send errors in 60 seconds")
  }
}

export function recordAckFailure(agentId: string): void {
  const count = (failedAcks.get(agentId) ?? 0) + 1
  failedAcks.set(agentId, count)

  if (count >= 5) {
    triggerPause(agentId, "5+ consecutive ack timeouts")
  }
}

export function recordAckSuccess(agentId: string): void {
  failedAcks.set(agentId, 0)
}

function triggerPause(agentId: string, reason: string): void {
  logger.warn({ agentId, reason }, "Pausing session outbound (throttle detected)")
  sessionManager.pause(agentId)

  setTimeout(() => {
    // Only resume if session reconnected (session manager will have the socket)
    if (sessionManager.get(agentId)) {
      sessionManager.resume(agentId)
      logger.info({ agentId }, "Session outbound resumed after cooldown")
    }
  }, COOLDOWN_MS)
}
