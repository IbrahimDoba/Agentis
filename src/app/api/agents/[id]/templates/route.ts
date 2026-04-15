import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"

interface Params {
  params: Promise<{ id: string }>
}

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const session = await auth()
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { id } = await params

    const agent = await db.agent.findUnique({ where: { id } })
    if (!agent) return NextResponse.json({ error: "Agent not found" }, { status: 404 })

    const isOwner = agent.userId === session.user.id
    const isAdmin = session.user.role === "ADMIN"
    if (!isOwner && !isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

    const templates = await db.messageTemplate.findMany({
      where: { agentId: id },
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true, content: true, createdAt: true, updatedAt: true },
    })

    return NextResponse.json({ templates })
  } catch (error) {
    console.error("[GET /api/agents/:id/templates]", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const session = await auth()
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { id } = await params

    const agent = await db.agent.findUnique({ where: { id } })
    if (!agent) return NextResponse.json({ error: "Agent not found" }, { status: 404 })

    const isOwner = agent.userId === session.user.id
    const isAdmin = session.user.role === "ADMIN"
    if (!isOwner && !isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

    const body = await req.json()
    const { name, content } = body

    if (!name?.trim() || !content?.trim()) {
      return NextResponse.json({ error: "Name and content are required" }, { status: 400 })
    }

    const template = await db.messageTemplate.create({
      data: { agentId: id, name: name.trim(), content: content.trim() },
    })

    return NextResponse.json({ template }, { status: 201 })
  } catch (error) {
    console.error("[POST /api/agents/:id/templates]", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
