import { NextRequest, NextResponse } from "next/server"
import { Webhook } from "svix"
import { db } from "@/lib/db"
import { suppress, isFreeMailHost } from "@/lib/outreach/suppression"
import { emailDomain } from "@/lib/outreach/normalize"

// Resend delivery events for the cold-sending domain. Bounces and complaints
// are the only two that change state; the rest are logged by their effect on
// the message row and nothing more.
//
// This is the feedback loop that keeps the channel alive. Gmail, Yahoo and
// Microsoft enforce complaints under 0.3% and bounces under 2% at the SMTP
// layer, and a domain that crosses either gets rejected rather than filtered.
// So a complaint here is treated as an incident, not a metric.

export const dynamic = "force-dynamic"

type ResendEvent = {
  type: string
  data?: { email_id?: string; to?: string[] | string; bounce?: { type?: string } }
}

export async function POST(req: NextRequest) {
  const secret = process.env.RESEND_WEBHOOK_SECRET
  const raw = await req.text()

  // Fail closed. An unauthenticated endpoint that writes suppressions is a
  // free denial-of-service against our own list.
  if (!secret) {
    console.error("[OUTREACH_WEBHOOK] RESEND_WEBHOOK_SECRET unset — rejecting")
    return NextResponse.json({ error: "Not configured" }, { status: 500 })
  }

  let event: ResendEvent
  try {
    event = new Webhook(secret).verify(raw, {
      "svix-id": req.headers.get("svix-id") ?? "",
      "svix-timestamp": req.headers.get("svix-timestamp") ?? "",
      "svix-signature": req.headers.get("svix-signature") ?? "",
    }) as ResendEvent
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 })
  }

  const providerMessageId = event.data?.email_id
  if (!providerMessageId) return NextResponse.json({ ok: true })

  const message = await db.outreachMessage.findUnique({
    where: { providerMessageId },
    select: { id: true, prospectId: true, toEmail: true },
  })
  // Transactional mail from email.ts shares the Resend account, so most events
  // arriving here belong to a message we do not track. Silently fine.
  if (!message) return NextResponse.json({ ok: true })

  switch (event.type) {
    case "email.bounced": {
      const hard = event.data?.bounce?.type?.toLowerCase() !== "transient"
      if (hard) {
        await suppress("email", message.toEmail, "hard_bounce")
        await db.outreachProspect.updateMany({
          where: { id: message.prospectId },
          data: { status: "bounced" },
        })
      }
      await db.outreachMessage.update({
        where: { id: message.id },
        data: { status: "failed", error: hard ? "hard bounce" : "soft bounce" },
      })
      break
    }

    case "email.complained": {
      await suppress("email", message.toEmail, "complained")
      // Also suppress the whole company domain. One person at a business
      // marking us as spam is a decision on behalf of that business, and a
      // second complaint from a colleague would be unforgivable. Free-mail
      // hosts are exempt inside suppress(), or one gmail complaint would
      // blackhole most of a Nigerian SMB list.
      const host = emailDomain(message.toEmail)
      if (!isFreeMailHost(host)) await suppress("domain", host, "complained")

      await db.outreachProspect.updateMany({
        where: { id: message.prospectId },
        data: { status: "unsubscribed" },
      })
      console.error(`[OUTREACH_WEBHOOK] complaint from ${message.toEmail} — review before sending more`)
      break
    }

    default:
      break
  }

  return NextResponse.json({ ok: true })
}
