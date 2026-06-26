import { NextRequest, NextResponse } from "next/server"
import { getResellerAdminContext } from "@/lib/resellerAdmin"
import { adjustResellerUserCredits } from "@/lib/resellerBilling"

interface Params { params: Promise<{ id: string }> }

// Manually add or deduct one of the reseller's customers' credits. "add" draws
// from her pool; "deduct" consumes from the customer's wallet (pool unchanged).
// Tenant-scoped inside adjustResellerUserCredits — the user must be hers.
export async function POST(req: NextRequest, { params }: Params) {
  const ctx = await getResellerAdminContext()
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  const body = await req.json().catch(() => ({}))
  const action = body?.action === "deduct" ? "deduct" : body?.action === "add" ? "add" : null
  if (!action) return NextResponse.json({ error: "action must be 'add' or 'deduct'" }, { status: 400 })

  const amount = Number(body?.amount)

  const result = await adjustResellerUserCredits({
    resellerId: ctx.resellerId,
    userId: id,
    action,
    amount,
  })
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 })
  return NextResponse.json(result)
}
