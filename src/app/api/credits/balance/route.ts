import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { getBalance } from "@/lib/creditWallet"

// GET /api/credits/balance
// Lightweight read used by the credits page + (future) header pill.
// Returns the user's spendable wallet balance and its rolling expiry date.
export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const balance = await getBalance(session.user.id)
  return NextResponse.json({
    creditBalance: balance.creditBalance,
    creditsExpireAt: balance.creditsExpireAt ? balance.creditsExpireAt.toISOString() : null,
  })
}
