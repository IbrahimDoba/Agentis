import { sql } from "../client.js"

export interface MediaItem {
    id: string
    agentId: string
    filename: string
    mimeType: string
    r2Key: string
    description: string
    tags: string[]
    createdAt: Date
}

export async function insertMediaItem(item: {
    agentId: string
    filename: string
    mimeType: string
    r2Key: string
    description: string
    tags: string[]
}): Promise<MediaItem> {
    const rows = await sql<MediaItem[]>`
    INSERT INTO "MediaItem" ("agentId", filename, "mimeType", "r2Key", description, tags)
    VALUES (${item.agentId}, ${item.filename}, ${item.mimeType}, ${item.r2Key}, ${item.description}, ${item.tags})
    RETURNING *
  `
    return rows[0]!
}

export async function getMediaItem(id: string): Promise<MediaItem | null> {
    const rows = await sql<MediaItem[]>`
    SELECT * FROM "MediaItem" WHERE id = ${id} LIMIT 1
  `
    return rows[0] ?? null
}

export async function listMediaItems(agentId: string): Promise<MediaItem[]> {
    return sql<MediaItem[]>`
    SELECT * FROM "MediaItem"
    WHERE "agentId" = ${agentId}
    ORDER BY "createdAt" DESC
  `
}

export async function deleteMediaItem(id: string): Promise<string | null> {
    const rows = await sql<{ r2Key: string }[]>`
    DELETE FROM "MediaItem" WHERE id = ${id} RETURNING "r2Key"
  `
    return rows[0]?.r2Key ?? null
}
