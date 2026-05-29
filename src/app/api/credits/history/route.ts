import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"

// GET /api/credits/history
// Recent credit purchases for the user — populates the "Receipts" list on
// the credits page. Capped at 50 so a heavy-buyer doesn't blow the response
// (rare; can paginate later if anyone hits the cap).
export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const purchases = await db.creditPurchase.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: {
      id: true,
      amountNaira: true,
      creditsAdded: true,
      reference: true,
      status: true,
      createdAt: true,
      completedAt: true,
      expiresAt: true,
    },
  })

  return NextResponse.json({
    purchases: purchases.map((p) => ({
      id: p.id,
      amountNaira: p.amountNaira,
      creditsAdded: p.creditsAdded,
      reference: p.reference,
      status: p.status,
      createdAt: p.createdAt.toISOString(),
      completedAt: p.completedAt ? p.completedAt.toISOString() : null,
      expiresAt: p.expiresAt.toISOString(),
    })),
  })
}
