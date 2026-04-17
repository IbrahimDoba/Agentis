import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { startOfDay, subDays, subWeeks, subMonths, format, eachDayOfInterval } from "date-fns"

interface Params {
  params: Promise<{ id: string }>
}

export async function GET(req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  const agent = await db.agent.findUnique({
    where: { id },
    select: { userId: true, elevenlabsAgentId: true },
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

  if (range === "day") {
    from = startOfDay(subDays(now, 6))      // last 7 days
  } else if (range === "week") {
    from = startOfDay(subWeeks(now, 11))    // last 12 weeks (grouped by week start)
  } else if (range === "month") {
    from = startOfDay(subMonths(now, 11))   // last 12 months (grouped by month)
  } else if (range === "custom" && fromParam && toParam) {
    from = startOfDay(new Date(fromParam))
    to = startOfDay(new Date(toParam))
  } else {
    from = startOfDay(subDays(now, 6))
  }

  const agentFilter = {
    OR: [
      { agentId: id },
      ...(agent.elevenlabsAgentId ? [{ elevenlabsAgentId: agent.elevenlabsAgentId }] : []),
    ],
  }

  // Fetch all conversations in the date range
  const logs = await db.conversationLog.findMany({
    where: {
      ...agentFilter,
      startTime: { gte: from, lte: new Date(to.getTime() + 86400000) },
    },
    select: { startTime: true, creditsUsed: true },
    orderBy: { startTime: "asc" },
  })

  // Group by day / week / month
  type Bucket = { label: string; conversations: number; credits: number }
  const buckets = new Map<string, Bucket>()

  if (range === "day" || (range === "custom" && fromParam && toParam)) {
    // Build all days in range so we have zero-filled gaps
    const days = eachDayOfInterval({ start: from, end: to })
    for (const d of days) {
      const key = format(d, "yyyy-MM-dd")
      buckets.set(key, { label: format(d, "d MMM"), conversations: 0, credits: 0 })
    }
    for (const log of logs) {
      if (!log.startTime) continue
      const key = format(log.startTime, "yyyy-MM-dd")
      const b = buckets.get(key)
      if (b) { b.conversations++; b.credits += log.creditsUsed }
    }
  } else if (range === "week") {
    // Group into ISO week buckets
    for (const log of logs) {
      if (!log.startTime) continue
      const weekStart = startOfDay(subDays(log.startTime, log.startTime.getDay()))
      const key = format(weekStart, "yyyy-MM-dd")
      if (!buckets.has(key)) {
        buckets.set(key, { label: format(weekStart, "d MMM"), conversations: 0, credits: 0 })
      }
      const b = buckets.get(key)!
      b.conversations++
      b.credits += log.creditsUsed
    }
  } else if (range === "month") {
    for (const log of logs) {
      if (!log.startTime) continue
      const key = format(log.startTime, "yyyy-MM")
      if (!buckets.has(key)) {
        buckets.set(key, { label: format(log.startTime, "MMM yy"), conversations: 0, credits: 0 })
      }
      const b = buckets.get(key)!
      b.conversations++
      b.credits += log.creditsUsed
    }
  }

  // Sort by key (chronological)
  const data = Array.from(buckets.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, v]) => v)

  // Summary stats
  const totalConversations = logs.length
  const totalCredits = logs.reduce((s, l) => s + l.creditsUsed, 0)

  // Busiest day (always per-day regardless of range)
  const dayMap = new Map<string, number>()
  for (const log of logs) {
    if (!log.startTime) continue
    const key = format(log.startTime, "EEEE") // Monday, Tuesday…
    dayMap.set(key, (dayMap.get(key) ?? 0) + 1)
  }
  let busiestDay: string | null = null
  let busiestCount = 0
  for (const [day, count] of dayMap) {
    if (count > busiestCount) { busiestDay = day; busiestCount = count }
  }

  return NextResponse.json({ data, totalConversations, totalCredits, busiestDay })
}
