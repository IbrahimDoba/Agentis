import { NextResponse } from "next/server"
import bcrypt from "bcryptjs"
import { randomBytes } from "node:crypto"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { PLATFORM_RESELLER_ID } from "@/lib/tenant"
import { DEMO_OWNER_EMAIL } from "@/lib/outreach/demo"

// Creates the single hidden account that owns every mirror-demo agent.
//
// An admin route rather than a seed script because the repo has no TypeScript
// runner, and idempotent so it can be re-run after any deploy without thinking
// about it. One owner means one userId filter excludes demo agents from every
// dashboard, billing and analytics query.

const DEMO_OWNER_CREDITS = Number(process.env.OUTREACH_DEMO_CREDITS ?? 50_000)

export async function POST() {
  const session = await auth()
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const existing = await db.user.findFirst({
    where: { email: DEMO_OWNER_EMAIL, resellerId: PLATFORM_RESELLER_ID },
    select: { id: true, creditBalance: true },
  })
  if (existing) {
    return NextResponse.json({ created: false, userId: existing.id, credits: existing.creditBalance })
  }

  // No one signs in as this account, so the password is random and discarded
  // rather than stored anywhere. Password reset is the recovery path if that
  // ever changes.
  const owner = await db.user.create({
    data: {
      name: "Outreach Demos",
      email: DEMO_OWNER_EMAIL,
      businessName: "Dailzero Outreach Demos",
      passwordHash: await bcrypt.hash(randomBytes(24).toString("base64url"), 12),
      role: "USER",
      status: "APPROVED",
      emailVerified: true,
      resellerId: PLATFORM_RESELLER_ID,
      // Prospect demos run on the PAYG wallet with a fixed, capped balance, so
      // an unexpectedly popular demo can only ever exhaust this one account.
      plan: "free",
      creditBalance: DEMO_OWNER_CREDITS,
      maxAgents: 500,
      onboardingCompleted: true,
    },
    select: { id: true, creditBalance: true },
  })

  return NextResponse.json({ created: true, userId: owner.id, credits: owner.creditBalance })
}
