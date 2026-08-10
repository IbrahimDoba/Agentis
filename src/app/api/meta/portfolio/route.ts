import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { getBusinessPortfolio } from "@/lib/meta/portfolio"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// GET — the business_management demo surface: the businesses this account
// administers and the WhatsApp Business Accounts each one owns.
export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  try {
    return NextResponse.json({ businesses: await getBusinessPortfolio() })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Portfolio lookup failed"
    console.error("[meta/portfolio] lookup failed:", message)
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
