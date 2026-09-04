import { NextRequest, NextResponse } from "next/server"
import { sendTemplate } from "@/lib/meta/cloud-api"
import { resolveNumberContext } from "@/lib/meta/routing"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// Template sending for the worker's broadcast queue. The worker owns pacing,
// spread scheduling and resumability; it calls here to actually send, because
// the connected business's token is encrypted with a key held only by this
// service — the same split as /api/meta/internal/send.
//
// Service-to-service, authenticated with WORKER_API_KEY.
export async function POST(req: NextRequest) {
  const expected = process.env.WORKER_API_KEY
  const provided = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "")
  if (!expected || provided !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const body = await req.json().catch(() => null)
  const phoneNumberId = typeof body?.phoneNumberId === "string" ? body.phoneNumberId : ""
  const to = typeof body?.to === "string" ? body.to.replace(/\D/g, "") : ""
  const name = typeof body?.templateName === "string" ? body.templateName : ""
  const language = typeof body?.templateLanguage === "string" ? body.templateLanguage : "en_US"
  // Positional body variables, already resolved per recipient by the caller.
  const params = Array.isArray(body?.params)
    ? body.params
        .filter((v: unknown): v is string => typeof v === "string")
        .map((text: string) => ({ type: "text" as const, text }))
    : []

  if (!phoneNumberId || !to || !name) {
    return NextResponse.json(
      { error: "phoneNumberId, to and templateName are required" },
      { status: 400 }
    )
  }

  const context = await resolveNumberContext(phoneNumberId)
  if (!context) {
    return NextResponse.json(
      { error: `No connection for phone_number_id ${phoneNumberId}` },
      { status: 400 }
    )
  }

  try {
    const sent = await sendTemplate(
      to,
      { name, language, params },
      { phoneNumberId: context.phoneNumberId, accessToken: context.accessToken }
    )
    return NextResponse.json({ ok: true, waMessageId: sent.waMessageId })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Template send failed"
    console.error("[meta/internal/send-template] failed:", message)
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
