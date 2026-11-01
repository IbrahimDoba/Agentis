import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { baileysClient } from "@/lib/baileys-client"
import { assertContactsAccess } from "@/lib/contacts-access"

interface Params {
  params: Promise<{ id: string }>
}

export async function POST(_req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  try {
    const { id } = await params
    const access = await assertContactsAccess(id, session.user.id, session.user.role, { spending: true })
    if ("error" in access) return access.error

    const res = await baileysClient.startContactSaveRun(id)
    if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status })
    return NextResponse.json(res.data, { status: 201 })
  } catch (error) {
    console.error("[POST /api/agents/:id/status-contacts/runs]", error)
    return NextResponse.json({ error: "Failed to start saving contacts" }, { status: 502 })
  }
}
