import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { baileysClient } from "@/lib/baileys-client"
import { assertContactsAccess } from "@/lib/contacts-access"
import { normalizeNameTag } from "@/lib/contact-name-tag"

interface Params {
  params: Promise<{ id: string }>
}

export async function GET(_req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  try {
    const { id } = await params
    const access = await assertContactsAccess(id, session.user.id, session.user.role)
    if ("error" in access) return access.error

    const summary = await baileysClient.contactsSummary(id)
    if (!summary.ok) return NextResponse.json({ error: summary.error }, { status: summary.status })

    // Settings come from the DB, not the worker's 60s cache, so a toggle the
    // owner just flipped shows up straight away.
    return NextResponse.json({
      ...summary.data,
      settings: { autoSaveContacts: access.agent.autoSaveContacts, contactNameTag: access.agent.contactNameTag },
    })
  } catch (error) {
    console.error("[GET /api/agents/:id/status-contacts]", error)
    return NextResponse.json({ error: "Failed to load contacts" }, { status: 502 })
  }
}

const settingsSchema = z.object({
  autoSaveContacts: z.boolean().optional(),
  contactNameTag: z.string().max(40).nullable().optional(),
})

export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const parsed = settingsSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: "Invalid body", details: parsed.error.flatten() }, { status: 400 })

  const data: { autoSaveContacts?: boolean; contactNameTag?: string | null } = {}
  if (parsed.data.autoSaveContacts !== undefined) data.autoSaveContacts = parsed.data.autoSaveContacts
  if (parsed.data.contactNameTag !== undefined) {
    const tag = normalizeNameTag(parsed.data.contactNameTag)
    if (!tag.ok) return NextResponse.json({ error: tag.error }, { status: 400 })
    data.contactNameTag = tag.tag
  }

  try {
    const { id } = await params
    const access = await assertContactsAccess(id, session.user.id, session.user.role)
    if ("error" in access) return access.error

    const agent = await db.agent.update({
      where: { id },
      data,
      select: { autoSaveContacts: true, contactNameTag: true },
    })
    baileysClient.invalidateContactSettings(id)
      .catch((err) => console.error("[PATCH /api/agents/:id/status-contacts] worker cache invalidate:", err))
    return NextResponse.json({ settings: agent })
  } catch (error) {
    console.error("[PATCH /api/agents/:id/status-contacts]", error)
    return NextResponse.json({ error: "Failed to save settings" }, { status: 500 })
  }
}
