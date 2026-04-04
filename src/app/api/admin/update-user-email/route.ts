import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { currentEmail, newEmail } = await req.json()
  if (!currentEmail || !newEmail) {
    return NextResponse.json({ error: "currentEmail and newEmail required" }, { status: 400 })
  }

  const user = await db.user.update({
    where: { email: currentEmail },
    data: { email: newEmail },
    select: { id: true, email: true },
  })

  return NextResponse.json({ ok: true, user })
}
