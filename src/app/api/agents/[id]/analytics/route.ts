import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { startOfDay, subDays, subWeeks, subMonths, format, eachDayOfInterval } from "date-fns"
import { getActivitySeries, getBusiestWeekday, type Granularity } from "@/lib/queries/conversationStats"

interface Params {
  params: Promise<{ id: string }>
}

type Bucket = { label: string; conversations: number; credits: number }

export async function GET(req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  const agent = await db.agent.findUnique({
    where: { id },
    select: { userId: true, elevenlabsAgentId: true, agentRuntime: true },
  })

  if (!agent) return NextResponse.json({ error: "Agent not found" }, { status: 404 })
  if (agent.userId !== session.user.id && session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const url = req.nextUrl
  const range = url.searchParams.get("range") ?? "week" // day | week | month | custom
  const fromParam = url.searchParams.get("from")
  const toParam = url.searchParams.get("to")

  const now = new Date()
  let from: Date
  let to: Date = startOfDay(now)
  let granularity: Granularity = "day"

  const customFrom = fromParam ? startOfDay(new Date(fromParam)) : null
  const customTo = toParam ? startOfDay(new Date(toParam)) : null
  const hasValidCustom =
    range === "custom" &&
    customFrom != null && customTo != null &&
    !Number.isNaN(customFrom.getTime()) && !Number.isNaN(customTo.getTime()) &&
    customFrom <= customTo

  if (range === "week") {
    from = startOfDay(subWeeks(now, 11))   // last 12 weeks
    granularity = "week"
  } else if (range === "month") {
    from = startOfDay(subMonths(now, 11))  // last 12 months
    granularity = "month"
  } else if (hasValidCustom) {
    from = customFrom!
    to = customTo!
  } else {
    from = startOfDay(subDays(now, 6))     // last 7 days
  }

  // Exclusive upper bound: `to` is the start of the last day we want to include.
  const rangeEnd = new Date(to.getTime() + 86400000)

  if (agent.agentRuntime === "orchestrator") {
    const [data, busiestDay] = await Promise.all([
      getActivitySeries(id, from, rangeEnd, granularity),
      getBusiestWeekday(id, from, rangeEnd),
    ])

    // Summed from the buckets rather than counted separately, so the headline
    // total can never disagree with the bars it sits above.
    return NextResponse.json({
      data,
      totalConversations: data.reduce((s, p) => s + p.conversations, 0),
      totalCredits: data.reduce((s, p) => s + p.credits, 0),
      busiestDay,
    })
  }

  // Legacy ElevenLabs runtime: no Conversation rows, only ConversationLog, and
  // one log IS one conversation. Kept for agents created before the runtime was
  // removed; new agents never reach this branch.
  const logs = await db.conversationLog.findMany({
    where: {
      OR: [
        { agentId: id },
        ...(agent.elevenlabsAgentId ? [{ elevenlabsAgentId: agent.elevenlabsAgentId }] : []),
      ],
      startTime: { gte: from, lt: rangeEnd },
    },
    select: { startTime: true, creditsUsed: true },
    orderBy: { startTime: "asc" },
  })

  const keyFor = (d: Date) =>
    granularity === "month" ? format(d, "yyyy-MM") : format(d, "yyyy-MM-dd")
  const labelFor = (d: Date) =>
    granularity === "month" ? format(d, "MMM yy") : format(d, "d MMM")

  const buckets = new Map<string, Bucket>()
  if (granularity === "day") {
    for (const d of eachDayOfInterval({ start: from, end: to })) {
      buckets.set(keyFor(d), { label: labelFor(d), conversations: 0, credits: 0 })
    }
  }
  for (const log of logs) {
    if (!log.startTime) continue
    const key = keyFor(log.startTime)
    const bucket = buckets.get(key) ?? { label: labelFor(log.startTime), conversations: 0, credits: 0 }
    bucket.conversations++
    bucket.credits += log.creditsUsed ?? 0
    buckets.set(key, bucket)
  }

  const data = Array.from(buckets.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, v]) => v)

  const weekdays = new Map<string, number>()
  for (const log of logs) {
    if (!log.startTime) continue
    const day = format(log.startTime, "EEEE")
    weekdays.set(day, (weekdays.get(day) ?? 0) + 1)
  }
  const busiestDay =
    [...weekdays.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null

  return NextResponse.json({
    data,
    totalConversations: data.reduce((s, p) => s + p.conversations, 0),
    totalCredits: data.reduce((s, p) => s + p.credits, 0),
    busiestDay,
  })
}
