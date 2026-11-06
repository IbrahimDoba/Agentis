import { sql } from "../db/client.js"
import { logger as rootLogger } from "../lib/logger.js"

const logger = rootLogger.child({ module: "auto-build" })

// The worker's half of building an agent from WhatsApp. It only moves
// Agent.autoConfigStatus forward; the orchestrator's sweep does the building.
// Nothing here calls another service, so a redeploy of either side can't lose
// a build: the row in Postgres is the whole job.
//
// Every UPDATE is guarded on the current status, which is what makes these safe
// to call on every connect and every history chunk: an agent that isn't mid
// auto-build (all existing agents) matches no row.

export async function markAutoBuildConnected(agentId: string): Promise<void> {
  await sql`
    UPDATE "Agent"
    SET "autoConfigStatus" = 'auto_profile',
        "autoConfigStartedAt" = COALESCE("autoConfigStartedAt", NOW())
    WHERE "id" = ${agentId} AND "autoConfigStatus" = 'auto_waiting'
  `.catch((err) => logger.warn({ agentId, err: err.message }, "Failed to mark auto-build connected"))
}

// History can land before the profile import finishes, so these also accept
// auto_waiting rather than assuming the connect step won the race.
export async function markAutoBuildChatsArriving(agentId: string): Promise<void> {
  await sql`
    UPDATE "Agent"
    SET "autoConfigStatus" = 'auto_chats',
        "autoConfigStartedAt" = COALESCE("autoConfigStartedAt", NOW())
    WHERE "id" = ${agentId} AND "autoConfigStatus" IN ('auto_waiting', 'auto_profile')
  `.catch((err) => logger.warn({ agentId, err: err.message }, "Failed to mark auto-build chats arriving"))
}

export async function markAutoBuildChatsSettled(agentId: string): Promise<void> {
  await sql`
    UPDATE "Agent"
    SET "autoConfigStatus" = 'auto_ready',
        "autoConfigStartedAt" = COALESCE("autoConfigStartedAt", NOW())
    WHERE "id" = ${agentId} AND "autoConfigStatus" IN ('auto_waiting', 'auto_profile', 'auto_chats')
  `.catch((err) => logger.warn({ agentId, err: err.message }, "Failed to mark auto-build chats settled"))
}
