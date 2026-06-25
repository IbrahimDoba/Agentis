import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { getResellerAdminContext } from "@/lib/resellerAdmin"

// Reseller dashboard summary: her pool balance + tenant counts.
export async function GET() {
  const ctx = await getResellerAdminContext()
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { resellerId } = ctx

  const [reseller, userCount, activeUsers, pendingUsers, planCount] = await Promise.all([
    db.reseller.findUnique({
      where: { id: resellerId },
      select: { name: true, appName: true, domain: true, creditPool: true, creditPoolTotal: true },
    }),
    db.user.count({ where: { resellerId } }),
    db.user.count({ where: { resellerId, status: "APPROVED" } }),
    db.user.count({ where: { resellerId, status: "PENDING" } }),
    db.resellerPlan.count({ where: { resellerId } }),
  ])

  return NextResponse.json({ reseller, userCount, activeUsers, pendingUsers, planCount })
}
