import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"

interface Params {
  params: Promise<{ id: string; templateId: string }>
}

async function getAgentAndVerifyAccess(agentId: string, userId: string, role: string) {
  const agent = await db.agent.findUnique({ where: { id: agentId } })
  if (!agent) return { error: "Agent not found", status: 404 }
  const isOwner = agent.userId === userId
  const isAdmin = role === "ADMIN"
  if (!isOwner && !isAdmin) return { error: "Forbidden", status: 403 }
  return { agent }
}

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const session = await auth()
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { id, templateId } = await params

    const access = await getAgentAndVerifyAccess(id, session.user.id, session.user.role)
    if ("error" in access) return NextResponse.json({ error: access.error }, { status: access.status })

    const template = await db.messageTemplate.findFirst({
      where: { id: templateId, agentId: id },
    })
    if (!template) return NextResponse.json({ error: "Template not found" }, { status: 404 })

    const body = await req.json()
    const { name, content } = body

    const updated = await db.messageTemplate.update({
      where: { id: templateId },
      data: {
        ...(name?.trim() ? { name: name.trim() } : {}),
        ...(content?.trim() ? { content: content.trim() } : {}),
      },
    })

    return NextResponse.json({ template: updated })
  } catch (error) {
    console.error("[PATCH /api/agents/:id/templates/:templateId]", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const session = await auth()
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { id, templateId } = await params

    const access = await getAgentAndVerifyAccess(id, session.user.id, session.user.role)
    if ("error" in access) return NextResponse.json({ error: access.error }, { status: access.status })

    const template = await db.messageTemplate.findFirst({
      where: { id: templateId, agentId: id },
    })
    if (!template) return NextResponse.json({ error: "Template not found" }, { status: 404 })

    await db.messageTemplate.delete({ where: { id: templateId } })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("[DELETE /api/agents/:id/templates/:templateId]", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
