import { sql } from "../db/client.js"
import { logger as rootLogger } from "../lib/logger.js"

const logger = rootLogger.child({ module: "auto-resume-ai" })

// How often we sweep. The per-agent `autoResumeAiAfterMinutes` controls WHEN a
// given conversation flips; this interval just bounds how soon after that
// threshold it actually happens.
const SWEEP_INTERVAL_MS = 2 * 60 * 1000 // every 2 minutes

let timer: ReturnType<typeof setInterval> | null = null

// Flip any human-mode conversation back to AI once it's been idle longer than
// its agent's configured threshold. Idempotent: re-running only touches rows
// that are still past threshold, so running it from multiple worker instances
// (or twice) is harmless. Clears the handoff flags so the "Needs human" badge
// goes away too.
async function runSweep(): Promise<void> {
  try {
    const rows = await sql<{ id: string }[]>`
      UPDATE "Conversation" c
      SET "mode" = 'ai',
          "handoffReason" = NULL,
          "handoffAt" = NULL,
          "handoffUrgency" = NULL
      FROM "Agent" a
      WHERE c."agentId" = a."id"
        AND c."mode" = 'human'
        AND a."autoResumeAiAfterMinutes" IS NOT NULL
        AND a."autoResumeAiAfterMinutes" > 0
        AND c."lastActivityAt" < NOW() - (a."autoResumeAiAfterMinutes" * INTERVAL '1 minute')
      RETURNING c."id"
    `
    if (rows.length > 0) {
      logger.info({ count: rows.length }, "Auto-resumed idle conversations back to AI")
    }
  } catch (err) {
    logger.warn({ err }, "Auto-resume-AI sweep failed")
  }
}

export function startAutoResumeSweep(): void {
  if (timer) return
  timer = setInterval(() => {
    void runSweep()
  }, SWEEP_INTERVAL_MS)
  // Don't hold the event loop open solely for this sweep.
  if (typeof timer.unref === "function") timer.unref()
  logger.info({ everyMs: SWEEP_INTERVAL_MS }, "Auto-resume-AI sweep started")
}

export function stopAutoResumeSweep(): void {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
}
