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
      ...(businessCategory ? { businessCategory } : {}),
      ...(businessDescription ? { businessDescription } : {}),
    },
  })

  return NextResponse.json({ ok: true })
}
