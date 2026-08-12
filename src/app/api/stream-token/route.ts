import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { mintStreamToken } from "@/lib/stream-token"

// Mints a short-lived ticket the browser uses to open the agent's SSE stream on
// the orchestrator (moving the long-lived connection off Vercel). This route is
// the authority for auth + ownership — the same checks the old in-app stream
// route did — so the orchestrator only has to verify the ticket signature.
// Deliberately fast (session + one indexed lookup + HMAC): no long-lived work.
export async function GET(req: NextRequest) {
  if (!process.env.STREAM_TOKEN_SECRET) {
    return NextResponse.json({ error: "Streaming not configured" }, { status: 503 })
  }

  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const agentId = req.nextUrl.searchParams.get("agentId")
  if (!agentId) return NextResponse.json({ error: "agentId required" }, { status: 400 })

  const agent = await db.agent.findUnique({ where: { id: agentId }, select: { userId: true } })
  if (!agent) return NextResponse.json({ error: "Not found" }, { status: 404 })
  if (agent.userId !== session.user.id && session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const token = mintStreamToken(agentId, session.user.id)
  // no-store: a ticket is single-use-ish and short-lived; never cache it.
  return NextResponse.json({ token }, { headers: { "Cache-Control": "no-store" } })
}
