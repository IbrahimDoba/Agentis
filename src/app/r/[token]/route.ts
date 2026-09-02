import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"

// Click tracking and first-touch attribution in one hop.
//
// This exists instead of an open-tracking pixel. Pixels hurt deliverability,
// have been meaningless since Apple Mail Privacy Protection, and are the
// weakest NDPA footing of anything in the pipeline. A click on a link the
// recipient chose to follow is both a stronger signal and an easier one to
// justify.

export const dynamic = "force-dynamic"

// Long enough that a prospect who reads the email today and signs up next month
// is still attributed, which is the realistic shape of an SMB buying decision.
const ATTRIBUTION_COOKIE_DAYS = 90

// The number prospects are invited to message. Digits only, country code first,
// e.g. 2348012345678. When set it becomes the click destination: the point of
// the email is to get them into a WhatsApp conversation with our own agent,
// which is the product demonstrating itself.
const WHATSAPP_NUMBER = (process.env.OUTREACH_WHATSAPP_NUMBER ?? "").replace(/\D/g, "")

/**
 * A wa.me link whose prefilled text carries a short reference derived from the
 * message token.
 *
 * The click through this route already recorded who it was, so the reference is
 * for the WhatsApp side: it arrives inside their first message, which is the
 * only way to tie a conversation back to the email that caused it. Prospects can
 * and do edit the text before sending, so treat it as best effort.
 */
function whatsappUrl(token: string): string {
  const ref = token.slice(0, 10)
  const text = `Hi Dailzero, I got your email. Can I see how this works? (ref: ${ref})`
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(text)}`
}

// Mirrors the folders under src/app/(marketing)/solutions/. Checked rather than
// interpolated blindly so a stray vertical value cannot produce a 404 in the one
// link the whole email is built around.
const SOLUTION_SLUGS = new Set([
  "ecommerce",
  "restaurants",
  "real-estate",
  "finance",
  "healthcare",
  "logistics",
  "customer-support",
  "lead-generation",
  "appointment-booking",
  "broadcasts",
])

export async function GET(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params

  const message = await db.outreachMessage.findUnique({
    where: { token },
    select: {
      step: true,
      prospectId: true,
      prospect: { select: { demoSlug: true, demoExpiresAt: true, vertical: true } },
    },
  })

  // An unrecognised token still lands somewhere useful rather than on a 404.
  if (!message) return NextResponse.redirect(new URL("/", req.url))

  const demoLive =
    message.prospect.demoSlug &&
    (!message.prospect.demoExpiresAt || message.prospect.demoExpiresAt > new Date())

  // Best available landing page, in order:
  //   1. their own demo, when one is live
  //   2. the solutions page for their vertical, which the sourcer already tagged
  //      and which speaks to their trade rather than to everyone
  //   3. the homepage
  //
  // Never /signup. A cold click is not a decision to sign up, and a form as the
  // first thing they see loses everyone who was merely curious. The attribution
  // cookie is set on the click regardless, so a signup days later still lands
  // against this message.
  const vertical = message.prospect.vertical
  const destination = demoLive
    ? new URL(`/demo/${message.prospect.demoSlug}`, req.url)
    : WHATSAPP_NUMBER
      ? new URL(whatsappUrl(token))
      : vertical && SOLUTION_SLUGS.has(vertical)
        ? new URL(`/solutions/${vertical}`, req.url)
        : new URL("/", req.url)

  // Not on a wa.me link: query params there surface as visible junk in the
  // prefilled message box, and there is no analytics on the other side to read
  // them anyway.
  if (destination.hostname !== "wa.me") {
    destination.searchParams.set("utm_source", "outreach")
    destination.searchParams.set("utm_medium", "email")
    destination.searchParams.set("utm_campaign", "cold-pilot")
    destination.searchParams.set("utm_content", `step${message.step}`)
  }

  const response = NextResponse.redirect(destination)
  response.cookies.set({
    name: "dz_attr",
    value: JSON.stringify({
      t: token,
      p: message.prospectId,
      s: "outreach",
      m: "email",
      c: "cold-pilot",
    }),
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: ATTRIBUTION_COOKIE_DAYS * 24 * 60 * 60,
  })
  return response
}
