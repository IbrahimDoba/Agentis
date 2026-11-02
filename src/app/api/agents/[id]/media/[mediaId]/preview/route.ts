import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"

interface Params {
  params: Promise<{ id: string; mediaId: string }>
}

const ORCHESTRATOR_URL = process.env.ORCHESTRATOR_URL || "http://localhost:4100"
const ORCHESTRATOR_API_KEY = process.env.ORCHESTRATOR_API_KEY
// Under the signed URL's 1h life, so a cached redirect never points at an
// expired link.
const CACHE_SECONDS = 50 * 60

// Library files are private in R2. This checks the caller owns the agent and
// the file, then redirects to a short-lived signed link, so <img>/<video> can
// show previews without the bucket ever being public.
export async function GET(_req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  try {
    const { id, mediaId } = await params
    if (!z.string().uuid().safeParse(mediaId).success) return NextResponse.json({ error: "Not found" }, { status: 404 })

    const agent = await db.agent.findUnique({ where: { id }, select: { userId: true } })
    if (!agent) return NextResponse.json({ error: "Agent not found" }, { status: 404 })
    if (agent.userId !== session.user.id && session.user.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 })

    const item = await db.mediaItem.findFirst({ where: { id: mediaId, agentId: id }, select: { r2Key: true } })
    if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 })

    const res = await fetch(`${ORCHESTRATOR_URL}/v1/media/sign?key=${encodeURIComponent(item.r2Key)}`, {
      headers: { Authorization: `Bearer ${ORCHESTRATOR_API_KEY}` },
    })
    const body = (await res.json().catch(() => null)) as { url?: string } | null
    if (!res.ok || !body?.url) throw new Error(`sign failed (${res.status})`)

    const redirect = NextResponse.redirect(body.url, 302)
    redirect.headers.set("Cache-Control", `private, max-age=${CACHE_SECONDS}`)
    return redirect
  } catch (error) {
    console.error("[GET /api/agents/:id/media/:mediaId/preview]", error)
    return NextResponse.json({ error: "Failed to load the preview" }, { status: 500 })
  }
}
