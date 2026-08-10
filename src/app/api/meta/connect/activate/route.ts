import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { activateConnection } from "@/lib/meta/embedded-signup"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// POST — registers the connected number for Cloud API sending and subscribes
// this app to its webhooks. Split from /api/meta/connect because both calls
// mutate a real phone number: registration sets the number's two-step PIN and
// claims it for the Cloud API, which is not trivially undone.
export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await req.json().catch(() => null)
  const phoneNumberId = typeof body?.phoneNumberId === "string" ? body.phoneNumberId : ""
  const pin = typeof body?.pin === "string" ? body.pin.trim() : ""

  if (!phoneNumberId || !/^\d{6}$/.test(pin)) {
    return NextResponse.json(
      { error: "phoneNumberId and a 6-digit pin are required" },
      { status: 400 }
    )
  }

  try {
    const row = await activateConnection(phoneNumberId, pin)
    return NextResponse.json({
      registeredAt: row.registeredAt?.toISOString() ?? null,
      subscribedAt: row.subscribedAt?.toISOString() ?? null,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Activation failed"
    console.error("[meta/connect/activate] failed:", message)
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
