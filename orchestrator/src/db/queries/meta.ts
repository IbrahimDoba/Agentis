import { sql } from "../client.js"

// True when the operator has turned AI replies OFF for one connected Cloud API
// number. Per-connection rather than per-agent: an agent can answer on a Baileys
// number and a Cloud API number at once, and silencing one must not silence the
// other. The inbound message is still saved during ingest either way — only
// generation is skipped, so the thread stays visible for a human to take over.
export async function isMetaAiRepliesPaused(phoneNumberId: string): Promise<boolean> {
  const rows = await sql<{ aiRepliesEnabled: boolean }[]>`
    SELECT "aiRepliesEnabled" FROM "MetaConnection"
    WHERE "phoneNumberId" = ${phoneNumberId} LIMIT 1
  `
  // A missing row means the number isn't connected here; the webhook already
  // refuses those, so treat it as "not paused" rather than silently muting.
  return rows[0]?.aiRepliesEnabled === false
}
