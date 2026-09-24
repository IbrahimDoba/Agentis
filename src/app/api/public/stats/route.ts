import { NextResponse } from "next/server"
import { getPublicStats } from "@/lib/queries/publicStats"

// Unauthenticated by design — that is why it sits under /api/public. It returns
// exactly the three totals already printed in the landing hero, and exists so
// the hero can keep ticking them without a reload.
//
// Everything expensive is behind getPublicStats' cache, so a scraper hitting
// this in a loop costs one count a minute, not one count a request.

export const dynamic = "force-dynamic"

export async function GET() {
  const stats = await getPublicStats()
  // getPublicStats already logged the reason. The hero keeps rendering whatever
  // it last had, so a failed poll is silent to the visitor by design.
  if (!stats) return NextResponse.json({ error: "Stats unavailable" }, { status: 503 })

  return NextResponse.json(stats, {
    headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" },
  })
}
