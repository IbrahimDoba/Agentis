import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { suppress } from "@/lib/outreach/suppression"
import { isNewsletterToken, verifyNewsletterUnsubToken } from "@/lib/outreach/unsubToken"

// One-click unsubscribe. GET is a human clicking the link in the body; POST is
// RFC 8058, which Gmail, Yahoo and Apple fire from their native unsubscribe
// button. Both suppress before responding — there is no confirmation step and
// no login, because anything that stands between the click and the suppression
// converts an unsubscribe into a spam complaint, and complaints are the metric
// that can kill the whole channel.

export const dynamic = "force-dynamic"

async function optOut(token: string): Promise<boolean> {
  // Newsletter tokens are signed and stateless; cold-outreach tokens are random
  // and stored on the message row. Both land here so there is one unsubscribe
  // URL shape across every kind of bulk mail we send.
  if (isNewsletterToken(token)) {
    const email = verifyNewsletterUnsubToken(token)
    if (!email) return false
    await suppress("email", email, "unsubscribed", "newsletter")
    await db.newsletterSubscriber.deleteMany({ where: { email } })
    return true
  }

  const message = await db.outreachMessage.findUnique({
    where: { token },
    select: { prospectId: true, toEmail: true, step: true },
  })
  if (!message) return false

  await suppress("email", message.toEmail, "unsubscribed", `step ${message.step}`)
  // updateMany, not update: the prospect may already have been erased on
  // request, and an unsubscribe must never 500 because of it.
  await db.outreachProspect.updateMany({
    where: { id: message.prospectId },
    data: { status: "unsubscribed" },
  })
  return true
}

export async function POST(_req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params
  await optOut(token)
  // Always 200. A mail provider retrying a one-click POST because we returned
  // an error is noise, and the outcome is the same either way.
  return new NextResponse(null, { status: 200 })
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params
  const found = await optOut(token)

  const message = found
    ? "You're unsubscribed. You will not hear from us again."
    : "That link has already been used, or it has expired. Either way you are unsubscribed."

  return new NextResponse(page(message), {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
  })
}

function page(message: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="robots" content="noindex">
  <title>Unsubscribed</title>
</head>
<body style="margin:0;font-family:-apple-system,Segoe UI,Arial,sans-serif;background:#f6f6f6;">
  <div style="max-width:460px;margin:16vh auto;padding:32px;background:#fff;border-radius:12px;text-align:center;">
    <p style="margin:0 0 12px;font-size:17px;color:#111;">${message}</p>
    <p style="margin:0;font-size:13px;color:#6b7280;">
      Want everything we hold about you deleted as well?
      <a href="https://www.dailzero.com/data-deletion" style="color:#6b7280;">Request deletion</a>.
    </p>
  </div>
</body>
</html>`
}
