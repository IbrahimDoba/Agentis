import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// Client-side breadcrumbs for the Embedded Signup flow. Most of that flow lives
// in the browser (popup, postMessage, FB.login callback), so when it fails
// before reaching /api/meta/connect there is nothing server-side to look at.
// This lets the panel report where it got to, so a failed attempt is
// diagnosable from `docker service logs` instead of guesswork.
export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await req.json().catch(() => null)
  const stage = typeof body?.stage === "string" ? body.stage.slice(0, 64) : "unknown"
  const detail = typeof body?.detail === "string" ? body.detail.slice(0, 500) : ""

  console.log(`[meta/connect:client] ${stage}${detail ? ` — ${detail}` : ""}`)
  return NextResponse.json({ ok: true })
}
