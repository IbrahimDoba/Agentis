import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { addCredits } from "@/lib/creditWallet"

interface Params { params: Promise<{ id: string }> }

// Admin allocates a custom amount of PAYG wallet credits to a user. These top
// up the user's spendable balance and reset the wallet expiry to 12 months from
// now (handled by addCredits). Super-admin only.
export async function POST(req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id } = await params
  const body = await req.json().catch(() => ({}))
  const amount = Math.floor(Number(body?.amount))
  if (!Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ error: "Enter a positive whole number of credits" }, { status: 400 })
  }

  const user = await db.user.findUnique({ where: { id }, select: { id: true } })
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 })

  const wallet = await addCredits(id, amount)
  return NextResponse.json({
    ok: true,
    creditBalance: wallet.creditBalance,
    creditsExpireAt: wallet.creditsExpireAt ? wallet.creditsExpireAt.toISOString() : null,
  })
}
