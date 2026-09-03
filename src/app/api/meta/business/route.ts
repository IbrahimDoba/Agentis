import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { getBusinessOverview } from "@/lib/meta/management"
import { resolveWabaContext } from "@/lib/meta/routing"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// GET — the whatsapp_business_management demo surface: the WABA, the numbers it
// owns, and its message templates, read live from the Graph API.
export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const waba = await resolveWabaContext(session.user.id)
  if (!waba) {
    return NextResponse.json(
      { error: "No connected WhatsApp Business Account on this workspace" },
      { status: 400 }
    )
  }

  try {
    return NextResponse.json(await getBusinessOverview(waba.wabaId, waba.accessToken))
  } catch (err) {
    const message = err instanceof Error ? err.message : "Business lookup failed"
    console.error("[meta/business] lookup failed:", message)
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
