import { db } from "@/lib/db"

// Reporting timezone. The servers run UTC but every customer is Nigerian, so
// bucketing by UTC days pushed 00:00–01:00 WAT traffic onto the previous day.
export const REPORTING_TZ = "Africa/Lagos"

export type Granularity = "day" | "week" | "month"

const STEP: Record<Granularity, string> = {
  day: "1 day",
  week: "1 week",
  month: "1 month",
}

// Labels are rendered in SQL. date_trunc against a timezone yields a `timestamp
// without time zone`, which node-postgres would re-read in the Node process's
// zone — correct on the UTC servers, an off-by-one-day on a dev machine in WAT.
const LABEL_FORMAT: Record<Granularity, string> = {
  day: "FMDD Mon",
  week: "FMDD Mon",
  month: "Mon YY",
}

/**
 * The conversations the Chats tab actually shows, as a SQL predicate on alias `c`.
 *
 * Mirrors src/app/api/agents/[id]/orchestrator-conversations/route.ts:
 *  - a soft-deleted thread stays hidden until the customer messages again
 *    (Prisma can't compare two columns, which is why that route filters in JS
 *    and this one is raw SQL),
 *  - an embed conversation with no messages is a visitor who opened the widget
 *    and never typed.
 *
 * Without this the Overview counted chats the operator had deleted, and widget
 * bounces, as customers.
 */
const VISIBLE_CONVERSATION = `
  (c."deletedAt" IS NULL OR (c."lastActivityAt" IS NOT NULL AND c."lastActivityAt" > c."deletedAt"))
  AND NOT (c.channel = 'embed' AND NOT EXISTS (
    SELECT 1 FROM "Message" m WHERE m."conversationId" = c.id
  ))
`

export type OverviewCounts = {
  conversations: number
  contacts: number
  /** Conversations in this cohort that carry a lead — the Leads Rate numerator. */
  converted: number
  aiMessages: number
}

/**
 * The four Overview cards, counted over one cohort so the rate they feed can't
 * exceed 100%.
 *
 * `since` scopes conversations by their own createdAt and AI messages by theirs,
 * so "AI messages in the last 7 days" stays a message count rather than a count
 * of messages belonging to conversations started in the last 7 days.
 */
export async function getOverviewCounts(
  agentIds: string[],
  ownerId: string,
  since: Date | null
): Promise<OverviewCounts> {
  if (agentIds.length === 0) {
    return { conversations: 0, contacts: 0, converted: 0, aiMessages: 0 }
  }

  const sinceIso = since?.toISOString() ?? null

  const [convRows, msgRows] = await Promise.all([
    db.$queryRawUnsafe<Array<{ conversations: number; contacts: number; converted: number }>>(
      `
      SELECT
        count(*)::int AS conversations,
        -- Embed conversations identify the visitor by visitorId and carry an
        -- empty phoneNumber; without the filter they'd all collapse into one
        -- bogus "contact".
        count(DISTINCT c."phoneNumber") FILTER (WHERE c."phoneNumber" <> '')::int AS contacts,
        count(*) FILTER (WHERE EXISTS (
          SELECT 1 FROM "Lead" l
          WHERE l."conversationId" = c.id AND l."userId" = $2
        ))::int                              AS converted
      FROM "Conversation" c
      WHERE c."agentId" = ANY($1::text[])
        AND ($3::timestamptz IS NULL OR c."createdAt" >= $3::timestamptz)
        AND ${VISIBLE_CONVERSATION}
      `,
      agentIds,
      ownerId,
      sinceIso
    ),
    db.$queryRawUnsafe<Array<{ total: number }>>(
      `
      SELECT count(*)::int AS total
      FROM "Message" msg
      JOIN "Conversation" c ON c.id = msg."conversationId"
      WHERE c."agentId" = ANY($1::text[])
        AND msg.direction = 'outbound'
        AND msg."senderRole" = 'ai'
        AND ($2::timestamptz IS NULL OR msg."createdAt" >= $2::timestamptz)
        AND ${VISIBLE_CONVERSATION}
      `,
      agentIds,
      sinceIso
    ),
  ])

  return {
    conversations: Number(convRows[0]?.conversations ?? 0),
    contacts: Number(convRows[0]?.contacts ?? 0),
    converted: Number(convRows[0]?.converted ?? 0),
    aiMessages: Number(msgRows[0]?.total ?? 0),
  }
}

export type ActivityPoint = { label: string; conversations: number; credits: number }

/**
 * Conversations STARTED and credits spent per bucket, zero-filled across the
 * whole range.
 *
 * The chart used to plot one point per conversation at `lastActivityAt`, which
 * made it a "when did this thread go quiet" histogram: 94% of conversations
 * landed on a day other than the one they started, and a bar changed after the
 * fact whenever an old thread got a new reply. Bucketing by createdAt in SQL
 * fixes both, and keeps conversations and credits on the same timezone-correct
 * boundaries (they were previously bucketed separately in JS, in UTC).
 */
export async function getActivitySeries(
  agentId: string,
  from: Date,
  to: Date,
  granularity: Granularity
): Promise<ActivityPoint[]> {
  const rows = await db.$queryRawUnsafe<
    Array<{ label: string; conversations: number; credits: number }>
  >(
    `
    WITH b AS (
      SELECT generate_series(
        date_trunc($1, $3::timestamptz AT TIME ZONE $2),
        date_trunc($1, $4::timestamptz AT TIME ZONE $2),
        $5::interval
      ) AS bucket
    ),
    conv AS (
      SELECT date_trunc($1, c."createdAt" AT TIME ZONE $2) AS bucket, count(*)::int AS n
      FROM "Conversation" c
      WHERE c."agentId" = $6
        AND c."createdAt" >= $3::timestamptz
        AND c."createdAt" < $4::timestamptz
        AND ${VISIBLE_CONVERSATION}
      GROUP BY 1
    ),
    cred AS (
      SELECT date_trunc($1, cu."createdAt" AT TIME ZONE $2) AS bucket,
             COALESCE(SUM(cu."creditsUsed"), 0)::int AS n
      FROM "CreditUsage" cu
      WHERE cu."agentId" = $6
        AND cu."createdAt" >= $3::timestamptz
        AND cu."createdAt" < $4::timestamptz
      GROUP BY 1
    )
    SELECT trim(to_char(b.bucket, $7)) AS label,
           COALESCE(conv.n, 0)::int AS conversations,
           COALESCE(cred.n, 0)::int AS credits
    FROM b
    LEFT JOIN conv ON conv.bucket = b.bucket
    LEFT JOIN cred ON cred.bucket = b.bucket
    ORDER BY b.bucket ASC
    `,
    granularity,
    REPORTING_TZ,
    from.toISOString(),
    to.toISOString(),
    STEP[granularity],
    agentId,
    LABEL_FORMAT[granularity]
  )

  return rows.map((r) => ({
    label: r.label,
    conversations: Number(r.conversations ?? 0),
    credits: Number(r.credits ?? 0),
  }))
}

/**
 * Weekday with the most conversations started, over the same visible cohort.
 * Computed in the reporting timezone so a Sunday-night message doesn't count
 * as Monday.
 */
export async function getBusiestWeekday(
  agentId: string,
  from: Date,
  to: Date
): Promise<string | null> {
  const rows = await db.$queryRawUnsafe<Array<{ weekday: string; n: number }>>(
    `
    SELECT trim(to_char(c."createdAt" AT TIME ZONE $4, 'Day')) AS weekday, count(*)::int AS n
    FROM "Conversation" c
    WHERE c."agentId" = $1
      AND c."createdAt" >= $2::timestamptz
      AND c."createdAt" < $3::timestamptz
      AND ${VISIBLE_CONVERSATION}
    GROUP BY 1
    ORDER BY n DESC, weekday ASC
    LIMIT 1
    `,
    agentId,
    from.toISOString(),
    to.toISOString(),
    REPORTING_TZ
  )

  return rows[0]?.weekday ?? null
}
