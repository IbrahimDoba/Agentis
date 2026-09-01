import { NextResponse } from "next/server"
import { requireViewer, viewerCanAccessAgent } from "@/lib/agentAccess"
import { baileysClient } from "@/lib/baileys-client"

export async function POST(req: Request) {
  // 401 is answered before the body is read, as it always was — a malformed
  // body from a logged-out caller must not turn into a 500.
  const viewer = await requireViewer()
  if (!viewer) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { agentId, initialTier } = await req.json()
  if (!agentId) return NextResponse.json({ error: "agentId required" }, { status: 400 })

  if (!(await viewerCanAccessAgent(viewer, agentId))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  try {
    const result = await baileysClient.createSession(agentId, initialTier)
    return NextResponse.json(result, { status: 201 })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 502 })
  }
}
