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

// Per-ACCOUNT usage: sum CreditUsage across ALL of a user's agents. The plan
// allowance is account-wide, so enforcement must sum every agent the user owns —
// summing a single agent let a multi-agent user exceed the limit without any one
// agent crossing it. Mirrors worker/src/db/queries.ts getMonthlyCreditsUsedForUser.
export async function sumCreditsForUser(userId: string, start?: Date, end?: Date): Promise<number> {
  const hasWindow = Boolean(start && end)
  const rows = hasWindow
    ? await db.$queryRawUnsafe<{ total: number | null }[]>(
        `
        SELECT COALESCE(SUM(cu."creditsUsed"), 0)::int as total
        FROM "CreditUsage" cu
        JOIN "Agent" a ON a."id" = cu."agentId"
        WHERE a."userId" = $1
          AND cu."createdAt" >= $2::timestamptz
          AND cu."createdAt" < $3::timestamptz
      `,
        userId,
        start!.toISOString(),
        end!.toISOString()
      )
    : await db.$queryRawUnsafe<{ total: number | null }[]>(
        `
        SELECT COALESCE(SUM(cu."creditsUsed"), 0)::int as total
        FROM "CreditUsage" cu
        JOIN "Agent" a ON a."id" = cu."agentId"
        WHERE a."userId" = $1
      `,
        userId
      )

  return Number(rows[0]?.total ?? 0)
}

export async function sumCreditsBySourceForAgents(
  agentIds: string[],
  start?: Date,
  end?: Date
): Promise<{ ai: number; human: number }> {
  if (agentIds.length === 0) return { ai: 0, human: 0 }

  const hasWindow = Boolean(start && end)
  const rows = hasWindow
    ? await db.$queryRawUnsafe<Array<{ source: string; total: number | null }>>(
        `
        SELECT "source", COALESCE(SUM("creditsUsed"), 0)::int as total
        FROM "CreditUsage"
        WHERE "agentId" = ANY($1::text[])
          AND "createdAt" >= $2::timestamptz
          AND "createdAt" < $3::timestamptz
        GROUP BY "source"
      `,
        agentIds,
        start!.toISOString(),
        end!.toISOString()
      )
    : await db.$queryRawUnsafe<Array<{ source: string; total: number | null }>>(
        `
        SELECT "source", COALESCE(SUM("creditsUsed"), 0)::int as total
        FROM "CreditUsage"
        WHERE "agentId" = ANY($1::text[])
        GROUP BY "source"
      `,
        agentIds
      )

  const ai = Number(rows.find((r) => r.source === "ai")?.total ?? 0)
  const human = Number(rows.find((r) => r.source === "human")?.total ?? 0)
  return { ai, human }
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
