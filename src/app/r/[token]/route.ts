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

export async function GET(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params

  const message = await db.outreachMessage.findUnique({
    where: { token },
    select: {
      step: true,
      prospectId: true,
      prospect: { select: { demoSlug: true, demoExpiresAt: true } },
    },
  })

  // An unrecognised token still lands somewhere useful rather than on a 404.
  if (!message) return NextResponse.redirect(new URL("/", req.url))

  const demoLive =
    message.prospect.demoSlug &&
    (!message.prospect.demoExpiresAt || message.prospect.demoExpiresAt > new Date())

  const destination = demoLive
    ? new URL(`/demo/${message.prospect.demoSlug}`, req.url)
    : new URL("/signup", req.url)

  destination.searchParams.set("utm_source", "outreach")
  destination.searchParams.set("utm_medium", "email")
  destination.searchParams.set("utm_campaign", "cold-pilot")
  destination.searchParams.set("utm_content", `step${message.step}`)

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
