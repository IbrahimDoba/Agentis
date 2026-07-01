import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"

// Admin view of the worker event log (connection failures, send failures, etc.).
// Super-admin only.
export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const category = searchParams.get("category")?.trim() || undefined
  const limit = Math.min(300, Math.max(1, Number(searchParams.get("limit") ?? 150)))

  const [events, grouped] = await Promise.all([
    db.workerEvent.findMany({
      where: category ? { category } : undefined,
      orderBy: { createdAt: "desc" },
      take: limit,
    }),
    db.workerEvent.groupBy({
      by: ["category"],
      _count: { _all: true },
      where: { createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } },
    }),
  ])

  return NextResponse.json({
    events: events.map((e) => ({
      id: e.id,
      level: e.level,
      category: e.category,
      agentId: e.agentId,
      message: e.message,
      detail: e.detail,
      createdAt: e.createdAt.toISOString(),
    })),
    categories: grouped
      .map((g) => ({ category: g.category, count: g._count._all }))
      .sort((a, b) => b.count - a.count),
  })
}
