import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { cancelSubscription } from "@/lib/subscriptionBilling"

// Turn off auto-renew. Access continues until subscriptionExpiresAt, after which
// the renewal cron downgrades the account to Free.
export async function POST() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  await cancelSubscription(session.user.id)
  return NextResponse.json({ ok: true })
}
