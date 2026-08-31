import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { createMessageTemplate, type TemplateCategory } from "@/lib/meta/management"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const CATEGORIES: TemplateCategory[] = ["UTILITY", "MARKETING"]

// POST — create a message template on the connected WABA. Exercises the write
// half of whatsapp_business_management; the read half is /api/meta/business.
// AUTHENTICATION templates are deliberately not offered: they require a fixed
// component shape Meta rejects anything else for.
export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await req.json().catch(() => null)
  const name = typeof body?.name === "string" ? body.name.trim() : ""
  const text = typeof body?.body === "string" ? body.body.trim() : ""
  const language = typeof body?.language === "string" ? body.language.trim() : "en_US"
  const category = body?.category as TemplateCategory

  if (!name || !text) {
    return NextResponse.json({ error: "name and body are required" }, { status: 400 })
  }
  if (!CATEGORIES.includes(category)) {
    return NextResponse.json(
      { error: `category must be one of: ${CATEGORIES.join(", ")}` },
      { status: 400 }
    )
  }

  try {
    return NextResponse.json({ template: await createMessageTemplate({ name, category, language, body: text }) })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Template creation failed"
    console.error("[meta/templates] create failed:", message)
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
