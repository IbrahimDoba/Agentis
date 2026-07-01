import { randomUUID } from "crypto"
import { sql } from "../db/client.js"
import { logger as rootLogger } from "./logger.js"

const logger = rootLogger.child({ module: "event-log" })

export interface WorkerEventInput {
  level?: "warn" | "error"
  category: string
  agentId?: string | null
  userId?: string | null
  message: string
  detail?: Record<string, unknown>
}

/**
 * Record a structured failure/event to the WorkerEvent table so it's queryable
 * from the DB / admin panel without Railway log access. BEST-EFFORT: it must
 * never throw — a failed insert can't be allowed to break a send or a
 * connection handler. Fire-and-forget: callers use `void recordEvent(...)`.
 */
export async function recordEvent(evt: WorkerEventInput): Promise<void> {
  try {
    await sql`
      INSERT INTO "WorkerEvent" ("id", "level", "category", "agentId", "userId", "message", "detail")
      VALUES (
        ${randomUUID()},
        ${evt.level ?? "error"},
        ${evt.category},
        ${evt.agentId ?? null},
        ${evt.userId ?? null},
        ${evt.message.slice(0, 2000)},
        ${evt.detail ? sql.json(evt.detail as never) : null}
      )
    `
  } catch (err) {
    logger.warn({ err, category: evt.category }, "Failed to record worker event")
  }
}
