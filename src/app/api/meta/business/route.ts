import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { getBusinessOverview } from "@/lib/meta/management"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// GET — the whatsapp_business_management demo surface: the WABA, the numbers it
// owns, and its message templates, read live from the Graph API.
export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  try {
    return NextResponse.json(await getBusinessOverview())
  } catch (err) {
    const message = err instanceof Error ? err.message : "Business lookup failed"
    console.error("[meta/business] lookup failed:", message)
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
