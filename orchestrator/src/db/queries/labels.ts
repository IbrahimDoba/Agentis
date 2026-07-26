import { sql } from "../client.js"

export interface AgentLabel {
  waLabelId: string
  name: string
  isStage: boolean
  stageOrder: number | null
  applyRule: string | null
}

// The agent's WhatsApp labels (synced from the phone), for the prompt list +
// validating a tag_conversation call. Stage labels first, in funnel order.
export async function listAgentLabels(agentId: string): Promise<AgentLabel[]> {
  return sql<AgentLabel[]>`
    SELECT "waLabelId", "name", "isStage", "stageOrder", "applyRule"
    FROM "WhatsAppLabel"
    WHERE "agentId" = ${agentId} AND "deleted" = false
    ORDER BY "isStage" DESC, "stageOrder" ASC NULLS LAST, "name" ASC
  `
}

// The stage labels currently on a chat — removed first when the AI swaps to a
// new stage (the "mix" rule: one stage active at a time).
export async function getChatStageLabelIds(agentId: string, chatJid: string): Promise<string[]> {
  const rows = await sql<{ waLabelId: string }[]>`
    SELECT c."waLabelId"
    FROM "ChatLabel" c
    JOIN "WhatsAppLabel" l ON l."agentId" = c."agentId" AND l."waLabelId" = c."waLabelId"
    WHERE c."agentId" = ${agentId} AND c."chatJid" = ${chatJid}
      AND l."isStage" = true AND l."deleted" = false
  `
  return rows.map((r) => r.waLabelId)
}

// True when the chat carries any label the operator set to "AI off" — the AI
// then stays silent for a human to handle. Matched on BOTH the resolved phone
// number and the raw chat JID to survive the LID/phone-number duality.
export async function chatHasAiDisabledLabel(
  agentId: string,
  phoneNumber: string | null,
  chatJid: string | null
): Promise<boolean> {
  if (!phoneNumber && !chatJid) return false
  try {
    const rows = await sql<{ one: number }[]>`
      SELECT 1 AS one
      FROM "ChatLabel" c
      JOIN "WhatsAppLabel" l ON l."agentId" = c."agentId" AND l."waLabelId" = c."waLabelId"
      WHERE c."agentId" = ${agentId}
        AND l."aiDisabled" = true AND l."deleted" = false
        AND (c."phoneNumber" = ${phoneNumber ?? ""} OR c."chatJid" = ${chatJid ?? ""})
      LIMIT 1
    `
    return rows.length > 0
  } catch {
    // If the column isn't there yet (pre-migration), fail OPEN (AI replies).
    return false
  }
}

// Gate for the tag_conversation tool. Defaults to off if the column isn't there
// yet (orchestrator deployed before the migration).
export async function isChatTaggingEnabled(agentId: string): Promise<boolean> {
  try {
    const rows = await sql<{ chatTaggingEnabled: boolean }[]>`
      SELECT "chatTaggingEnabled" FROM "Agent" WHERE "id" = ${agentId} LIMIT 1
    `
    return rows[0]?.chatTaggingEnabled === true
  } catch {
    return false
  }
}

// Both tagging flags in one query (used on the human-mode / paused path so we
// don't do two round-trips). Defaults off if the columns aren't present yet.
export async function getChatTaggingFlags(
  agentId: string
): Promise<{ tagging: boolean; background: boolean }> {
  try {
    const rows = await sql<{ chatTaggingEnabled: boolean; backgroundTaggingEnabled: boolean }[]>`
      SELECT "chatTaggingEnabled", "backgroundTaggingEnabled" FROM "Agent" WHERE "id" = ${agentId} LIMIT 1
    `
    return {
      tagging: rows[0]?.chatTaggingEnabled === true,
      background: rows[0]?.backgroundTaggingEnabled === true,
    }
  } catch {
    return { tagging: false, background: false }
  }
}
