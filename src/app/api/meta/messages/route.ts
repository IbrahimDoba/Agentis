import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { metaConfigStatus, sendText } from "@/lib/meta/cloud-api"
import { appendMessage, getRecent, resolveTestPersona } from "@/lib/meta/store"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// GET — powers the test UI: recent messages (optionally incremental via ?since),
// the env config status, and which agent persona is answering.
export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const since = req.nextUrl.searchParams.get("since") || undefined
  const messages = await getRecent(100, since)
  const persona = await resolveTestPersona()

  return NextResponse.json({
    config: metaConfigStatus(),
    persona: persona ? { agentId: persona.agentId, businessName: persona.businessName } : null,
    messages,
  })
}

// POST — send a manual outbound text from the harness (demonstrates the send
// path directly, and lets you open the 24h window on camera). Only delivers if
// the recipient is a verified test recipient.
export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await req.json().catch(() => null)
  const to = typeof body?.to === "string" ? body.to.replace(/[^\d]/g, "") : ""
  const text = typeof body?.text === "string" ? body.text.trim() : ""

  if (!to || !text) {
    return NextResponse.json({ error: "to (digits) and text are required" }, { status: 400 })
  }

  try {
    const sent = await sendText(to, text)
    const stored = await appendMessage({
      waId: to,
      direction: "outbound",
      text,
      waMessageId: sent.waMessageId,
      raw: sent.raw,
    })
    return NextResponse.json({ message: stored, waMessageId: sent.waMessageId })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Send failed"
    console.error("[meta/messages] send failed:", message)
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
