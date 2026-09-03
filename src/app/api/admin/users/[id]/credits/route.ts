import { withAdmin } from "@/lib/api/withAuth"
import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { addCredits, deductFromWallet, getBalance } from "@/lib/creditWallet"

interface Params { params: Promise<{ id: string }> }

// Admin adjusts a user's PAYG wallet credits. `action: "add"` (default) tops up
// the spendable balance and resets the wallet expiry to 12 months from now;
// `action: "deduct"` removes credits, guarded so the balance can never go
// negative (e.g. correcting an over-grant). Super-admin only.
export const POST = withAdmin(async (req: NextRequest, { params }: Params) => {
  const { id } = await params
  const body = await req.json().catch(() => ({}))
  const action = body?.action === "deduct" ? "deduct" : "add"
  const amount = Math.floor(Number(body?.amount))
  if (!Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ error: "Enter a positive whole number of credits" }, { status: 400 })
  }

  const user = await db.user.findUnique({ where: { id }, select: { id: true } })
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 })

  if (action === "deduct") {
    // Removing credits. deductFromWallet is atomic and refuses to overdraw, so a
    // request to remove more than the (non-expired) balance fails cleanly rather
    // than zeroing it out — the admin sees exactly what's available.
    const result = await deductFromWallet(id, amount)
    if (!result.ok) {
      return NextResponse.json(
        { error: `User only has ${result.newBalance.toLocaleString()} spendable credits` },
        { status: 400 }
      )
    }
    // Deduct leaves the existing expiry untouched. Report it back for the UI.
    const wallet = await getBalance(id)
    return NextResponse.json({
      ok: true,
      creditBalance: result.newBalance,
      creditsExpireAt: wallet.creditsExpireAt ? wallet.creditsExpireAt.toISOString() : null,
    })
  }

  const wallet = await addCredits(id, amount)
  return NextResponse.json({
    ok: true,
    creditBalance: wallet.creditBalance,
    creditsExpireAt: wallet.creditsExpireAt ? wallet.creditsExpireAt.toISOString() : null,
  })
})
