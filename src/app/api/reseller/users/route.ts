import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { getResellerAdminContext } from "@/lib/resellerAdmin"

// Her customers — every user in this reseller's tenant. Strictly scoped to
// `resellerId`, so one tenant can never see another's users.
export async function GET() {
  const ctx = await getResellerAdminContext()
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const users = await db.user.findMany({
    where: { resellerId: ctx.resellerId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      email: true,
      businessName: true,
      role: true,
      status: true,
      plan: true,
      creditBalance: true,
      creditsExpireAt: true,
      subscriptionExpiresAt: true,
      createdAt: true,
    },
  })

  return NextResponse.json({ users })
}
