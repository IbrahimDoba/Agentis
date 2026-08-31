import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { metaConfigStatus, sendText } from "@/lib/meta/cloud-api"
import { appendMessage, getRecent } from "@/lib/meta/store"
import { db } from "@/lib/db"
import { resolveNumberContext } from "@/lib/meta/routing"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// Numbers this operator may see. Their own connected numbers, plus — for
// platform admins only — the env-configured number, which belongs to us rather
// than to any customer. Without the role check, every onboarded customer would
// see our own number's conversations.
async function visibleNumbers(userId: string, role: string): Promise<string[]> {
  const connections = await db.metaTestConnection.findMany({
    where: { userId },
    select: { phoneNumberId: true },
  })
  const ids = connections.map((c) => c.phoneNumberId)
  const envNumber = process.env.META_TEST_PHONE_NUMBER_ID
  if (role === "ADMIN" && envNumber && !ids.includes(envNumber)) ids.unshift(envNumber)
  return ids
}

// GET — powers the Meta tab: recent messages (optionally incremental via ?since),
// the env config status, and which agent persona is answering.
export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const since = req.nextUrl.searchParams.get("since") || undefined
  const numbers = await visibleNumbers(session.user.id, session.user.role)
  const messages = numbers.length ? await getRecent(100, since, numbers) : []

  // The persona shown in the header is whoever answers on the first visible
  // number, so the label matches what a customer would actually get back.
  const context = numbers[0] ? await resolveNumberContext(numbers[0]) : null

  return NextResponse.json({
    config: metaConfigStatus(),
    persona: context
      ? { agentId: context.persona.agentId, businessName: context.persona.businessName }
      : null,
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

  // Which of our numbers to send from. Defaults to the first the operator can
  // see, so the existing single-number dashboard behaves exactly as before.
  const numbers = await visibleNumbers(session.user.id, session.user.role)
  const requested = typeof body?.phoneNumberId === "string" ? body.phoneNumberId : null
  const phoneNumberId = requested ?? numbers[0]

  if (!phoneNumberId || !numbers.includes(phoneNumberId)) {
    return NextResponse.json({ error: "No connected number to send from" }, { status: 400 })
  }

  try {
    const context = await resolveNumberContext(phoneNumberId)
    if (!context) {
      return NextResponse.json(
        { error: "That number has no agent assigned yet" },
        { status: 400 }
      )
    }

    const sent = await sendText(to, text, {
      phoneNumberId: context.phoneNumberId,
      accessToken: context.accessToken,
    })
    const stored = await appendMessage({
      waId: to,
      phoneNumberId,
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
