import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { sendNewsletter } from "@/lib/email"
import { NextRequest, NextResponse } from "next/server"

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { subject, title, body, ctaText, ctaUrl, recipientType } = await req.json()

  if (!subject || !title || !body) {
    return NextResponse.json({ error: "subject, title, and body are required" }, { status: 400 })
  }

  // Collect recipients
  const emails = new Set<string>()

  if (recipientType === "subscribers" || recipientType === "both") {
    const subs = await db.newsletterSubscriber.findMany({ select: { email: true } })
    subs.forEach((s) => emails.add(s.email))
  }

  if (recipientType === "users" || recipientType === "both") {
    const users = await db.user.findMany({
      where: { status: "APPROVED" },
      select: { email: true },
    })
    users.forEach((u) => emails.add(u.email))
  }

  const list = Array.from(emails)
  if (list.length === 0) {
    return NextResponse.json({ error: "No recipients found" }, { status: 400 })
  }

  // Send in batches of 50 to avoid rate limits
  const BATCH = 50
  let sent = 0
  for (let i = 0; i < list.length; i += BATCH) {
    const batch = list.slice(i, i + BATCH)
    await Promise.all(
      batch.map((email) =>
        sendNewsletter({ email, subject, title, body, ctaText, ctaUrl }).catch((e) =>
          console.error(`Failed to send to ${email}:`, e)
        )
      )
    )
    sent += batch.length
  }

  return NextResponse.json({ ok: true, sent })
}

export async function GET() {
  const session = await auth()
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const [subscriberCount, userCount] = await Promise.all([
    db.newsletterSubscriber.count(),
    db.user.count({ where: { status: "APPROVED" } }),
  ])

  return NextResponse.json({ subscriberCount, userCount })
}
