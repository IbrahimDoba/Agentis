import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import {
  createMessageTemplate,
  listTemplates,
  deleteTemplate,
  type TemplateCategory,
} from "@/lib/meta/management"
import { resolveWabaContext } from "@/lib/meta/routing"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const CATEGORIES: TemplateCategory[] = ["UTILITY", "MARKETING"]

// Every handler resolves the WABA from the caller's own connections, so an
// operator can only ever read or change templates on an account they connected.
async function requireWaba(phoneNumberId?: string | null) {
  const session = await auth()
  if (!session) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) }

  const waba = await resolveWabaContext(session.user.id, session.user.role, phoneNumberId)
  if (!waba) {
    return {
      error: NextResponse.json(
        { error: "No connected WhatsApp Business Account on this workspace" },
        { status: 400 }
      ),
    }
  }
  return { waba }
}

// GET — one page of templates for the caller's WABA. `?after=` continues.
export async function GET(req: NextRequest) {
  const { waba, error } = await requireWaba(req.nextUrl.searchParams.get("phoneNumberId"))
  if (error) return error

  try {
    const page = await listTemplates(
      waba!.wabaId,
      waba!.accessToken,
      req.nextUrl.searchParams.get("after")
    )
    return NextResponse.json({
      ...page,
      account: { wabaId: waba!.wabaId, displayPhoneNumber: waba!.displayPhoneNumber },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Template lookup failed"
    console.error("[meta/templates] list failed:", message)
    return NextResponse.json({ error: message }, { status: 502 })
  }
}

// POST — create a template. Meta reviews it, so the returned status is normally
// PENDING and flips later via the message_template_status_update webhook.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  const { waba, error } = await requireWaba(
    typeof body?.phoneNumberId === "string" ? body.phoneNumberId : null
  )
  if (error) return error

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
    const template = await createMessageTemplate(
      { name, category, language, body: text },
      { wabaId: waba!.wabaId, accessToken: waba!.accessToken }
    )
    return NextResponse.json({ template })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Template creation failed"
    console.error("[meta/templates] create failed:", message)
    return NextResponse.json({ error: message }, { status: 502 })
  }
}

// DELETE — removes every language variant sharing the name, which is how Meta's
// endpoint behaves. The UI says so before asking for confirmation.
export async function DELETE(req: NextRequest) {
  const name = req.nextUrl.searchParams.get("name")
  const { waba, error } = await requireWaba(req.nextUrl.searchParams.get("phoneNumberId"))
  if (error) return error
  if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 })

  try {
    await deleteTemplate(waba!.wabaId, waba!.accessToken, name)
    return NextResponse.json({ ok: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Template delete failed"
    console.error("[meta/templates] delete failed:", message)
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
