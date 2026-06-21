import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"

// Re-enable auto-renew on a subscription the user previously cancelled. Requires
// a reusable card on file (otherwise there's nothing to auto-charge).
export async function POST() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: { authorizationReusable: true, subscriptionExpiresAt: true },
  })
  if (!user?.authorizationReusable) {
    return NextResponse.json(
      { error: "No reusable card on file — add a card to enable auto-renew." },
      { status: 400 }
    )
  }

  await db.user.update({
    where: { id: session.user.id },
    data: { autoRenew: true, cancelAtPeriodEnd: false, subscriptionStatus: "active" },
  })
  return NextResponse.json({ ok: true })
}
