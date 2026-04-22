import { db } from "@/lib/db"

export async function sumCreditsForAgents(
  agentIds: string[],
  start?: Date,
  end?: Date
): Promise<number> {
  if (agentIds.length === 0) return 0

  const hasWindow = Boolean(start && end)
  const rows = hasWindow
    ? await db.$queryRawUnsafe<{ total: number | null }[]>(
        `
        SELECT COALESCE(SUM("creditsUsed"), 0)::int as total
        FROM "CreditUsage"
        WHERE "agentId" = ANY($1::text[])
          AND "createdAt" >= $2::timestamptz
          AND "createdAt" < $3::timestamptz
      `,
        agentIds,
        start!.toISOString(),
        end!.toISOString()
      )
    : await db.$queryRawUnsafe<{ total: number | null }[]>(
        `
        SELECT COALESCE(SUM("creditsUsed"), 0)::int as total
        FROM "CreditUsage"
        WHERE "agentId" = ANY($1::text[])
      `,
        agentIds
      )

  return Number(rows[0]?.total ?? 0)
}

export async function listAgentCreditEvents(
  agentId: string,
  start: Date,
  end: Date
): Promise<Array<{ at: Date; credits: number }>> {
  const rows = await db.$queryRawUnsafe<Array<{ createdAt: Date; creditsUsed: number }>>(
    `
      SELECT "createdAt", "creditsUsed"
      FROM "CreditUsage"
      WHERE "agentId" = $1
        AND "createdAt" >= $2::timestamptz
        AND "createdAt" < $3::timestamptz
      ORDER BY "createdAt" ASC
    `,
    agentId,
    start.toISOString(),
    end.toISOString()
  )

  return rows.map((r) => ({ at: new Date(r.createdAt), credits: Number(r.creditsUsed ?? 0) }))
}
