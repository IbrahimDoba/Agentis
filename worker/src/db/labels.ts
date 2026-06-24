import { randomUUID } from "crypto"
import { sql } from "./client.js"

// Raw-SQL label persistence for the worker (mirrors WhatsApp labels into our DB).
// The Next.js side reads these via Prisma; the worker only writes them.

export async function upsertWhatsAppLabel(
  agentId: string,
  label: { waLabelId: string; name: string; color: number; predefinedId?: string | null; deleted: boolean }
): Promise<void> {
  await sql`
    INSERT INTO "WhatsAppLabel"
      ("id", "agentId", "waLabelId", "name", "color", "predefinedId", "deleted", "updatedAt")
    VALUES (
      ${randomUUID()}, ${agentId}, ${label.waLabelId}, ${label.name}, ${label.color},
      ${label.predefinedId ?? null}, ${label.deleted}, NOW()
    )
    ON CONFLICT ("agentId", "waLabelId") DO UPDATE SET
      "name" = EXCLUDED."name",
      "color" = EXCLUDED."color",
      "predefinedId" = EXCLUDED."predefinedId",
      "deleted" = EXCLUDED."deleted",
      "updatedAt" = NOW()
  `
}

export async function addChatLabelAssoc(
  agentId: string,
  chatJid: string,
  phoneNumber: string | null,
  waLabelId: string,
  appliedBy: "whatsapp" | "ai" | "operator" = "whatsapp"
): Promise<void> {
  await sql`
    INSERT INTO "ChatLabel" ("id", "agentId", "chatJid", "phoneNumber", "waLabelId", "appliedBy")
    VALUES (${randomUUID()}, ${agentId}, ${chatJid}, ${phoneNumber}, ${waLabelId}, ${appliedBy})
    ON CONFLICT ("agentId", "chatJid", "waLabelId") DO NOTHING
  `
}

export async function removeChatLabelAssoc(
  agentId: string,
  chatJid: string,
  waLabelId: string
): Promise<void> {
  await sql`
    DELETE FROM "ChatLabel"
    WHERE "agentId" = ${agentId} AND "chatJid" = ${chatJid} AND "waLabelId" = ${waLabelId}
  `
}

export interface SyncedLabel {
  waLabelId: string
  name: string
  color: number
  predefinedId: string | null
  deleted: boolean
  isStage: boolean
  stageOrder: number | null
  applyRule: string | null
  chatCount: number
}

export async function listWhatsAppLabels(agentId: string): Promise<SyncedLabel[]> {
  const rows = await sql<SyncedLabel[]>`
    SELECT l."waLabelId", l."name", l."color", l."predefinedId", l."deleted",
           l."isStage", l."stageOrder", l."applyRule",
           COALESCE(c.cnt, 0)::int AS "chatCount"
    FROM "WhatsAppLabel" l
    LEFT JOIN (
      SELECT "waLabelId", COUNT(*) AS cnt FROM "ChatLabel"
      WHERE "agentId" = ${agentId} GROUP BY "waLabelId"
    ) c ON c."waLabelId" = l."waLabelId"
    WHERE l."agentId" = ${agentId} AND l."deleted" = false
    ORDER BY l."isStage" DESC, l."stageOrder" ASC NULLS LAST, l."name" ASC
  `
  return rows as unknown as SyncedLabel[]
}
