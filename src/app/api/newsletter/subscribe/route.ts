import { db } from "@/lib/db"
import { NextRequest, NextResponse } from "next/server"

export async function POST(req: NextRequest) {
  const { email, name } = await req.json()

  if (!email || typeof email !== "string" || !email.includes("@")) {
    return NextResponse.json({ error: "Valid email required" }, { status: 400 })
  }

  try {
    await db.newsletterSubscriber.upsert({
      where: { email: email.toLowerCase().trim() },
      update: { name: name || null },
      create: { email: email.toLowerCase().trim(), name: name || null, source: "footer" },
    })
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: "Failed to subscribe" }, { status: 500 })
  }
}
