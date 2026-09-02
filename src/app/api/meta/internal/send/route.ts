import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { sendText } from "@/lib/meta/cloud-api"
import { resolveNumberContext } from "@/lib/meta/routing"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// Cloud API dispatch for the orchestrator. It runs the whole AI pipeline for a
// "meta" conversation but can't send the reply itself: the connected business's
// token is encrypted with a key held only by this service. So it calls here.
//
// Service-to-service, authenticated with ORCHESTRATOR_API_KEY — never reachable
// with a user session.
export async function POST(req: NextRequest) {
  const expected = process.env.ORCHESTRATOR_API_KEY
  const provided = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "")
  if (!expected || provided !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const body = await req.json().catch(() => null)
  const conversationId = typeof body?.conversationId === "string" ? body.conversationId : ""
  const to = typeof body?.to === "string" ? body.to.replace(/\D/g, "") : ""
  const text = typeof body?.text === "string" ? body.text.trim() : ""

  if (!conversationId || !to || !text) {
    return NextResponse.json(
      { error: "conversationId, to and text are required" },
      { status: 400 }
    )
  }

  // The conversation records which of our numbers it belongs to; that decides
  // whose token the reply goes out with.
  const conversation = await db.conversation.findUnique({
    where: { id: conversationId },
    select: { metaPhoneNumberId: true, channel: true },
  })
  if (!conversation || conversation.channel !== "meta" || !conversation.metaPhoneNumberId) {
    return NextResponse.json({ error: "Not a Meta conversation" }, { status: 400 })
  }

  const context = await resolveNumberContext(conversation.metaPhoneNumberId)
  if (!context) {
    return NextResponse.json(
      { error: `No connection for phone_number_id ${conversation.metaPhoneNumberId}` },
      { status: 400 }
    )
  }

  try {
    const sent = await sendText(to, text, {
      phoneNumberId: context.phoneNumberId,
      accessToken: context.accessToken,
    })
    return NextResponse.json({ ok: true, waMessageId: sent.waMessageId })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Send failed"
    console.error("[meta/internal/send] failed:", message)
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
