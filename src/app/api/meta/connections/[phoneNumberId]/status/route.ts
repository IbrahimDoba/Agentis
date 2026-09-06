import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { resolveWabaContext } from "@/lib/meta/routing"
import { getNumberStatus } from "@/lib/meta/management"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

interface Params {
  params: Promise<{ phoneNumberId: string }>
}

// GET — live status straight from Graph, not a cached copy. These fields change
// on Meta's schedule (a tier bump, a quality drop, a display-name outcome) with
// no webhook for most of them, so a stored value would be quietly wrong exactly
// when someone is looking at it to explain a delivery problem.
export async function GET(_req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { phoneNumberId } = await params

  try {
    // Scoped to connections this account owns — the resolver is the tenant check.
    const context = await resolveWabaContext(session.user.id, phoneNumberId)
    if (!context) return NextResponse.json({ error: "Not found" }, { status: 404 })

    const status = await getNumberStatus(phoneNumberId, context.wabaId, context.accessToken)
    return NextResponse.json(status)
  } catch (err) {
    const message = err instanceof Error ? err.message : "Status lookup failed"
    console.error(`[meta/connections] status ${phoneNumberId} failed:`, message)
    // 502: the failure is Graph's, not the caller's — surfaced so the panel can
    // say "couldn't reach Meta" instead of rendering blanks that look like nulls.
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
