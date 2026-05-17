import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { NextRequest, NextResponse } from "next/server"

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await req.json()
  const { businessCategory, businessDescription, goals } = body

  await db.user.update({
    where: { id: session.user.id },
    data: {
      onboardingCompleted: true,
      // Enable WhatsApp full-history sync so the auto-configure step
      // (immediately after onboarding) has the full set of recent customer
      // chats to learn from. The user implicitly consented when they saw
      // the "we'll briefly study your recent chats" copy on step 3.
      historySyncEnabled: true,
      ...(businessCategory ? { businessCategory } : {}),
      ...(businessDescription ? { businessDescription } : {}),
      ...(goals?.length ? { businessGoals: goals.join(",") } : {}),
    },
  })

  return NextResponse.json({ ok: true })
}
