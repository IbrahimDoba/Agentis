import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import {
  getElevenLabsAgent,
  uploadKnowledgeBaseFile,
  addKnowledgeBaseUrl,
  updateAgentKnowledgeBase,
} from "@/lib/elevenlabs"

interface Params {
  params: Promise<{ id: string }>
}

// GET — fetch current knowledge base docs from ElevenLabs
export async function GET(req: NextRequest, { params }: Params) {
  try {
    const session = await auth()
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { id } = await params
    const agent = await db.agent.findUnique({ where: { id }, select: { userId: true, elevenlabsAgentId: true } })
    if (!agent) return NextResponse.json({ error: "Agent not found" }, { status: 404 })

    const isOwner = agent.userId === session.user.id
    const isAdmin = session.user.role === "ADMIN"
    if (!isOwner && !isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

    if (!agent.elevenlabsAgentId) {
      return NextResponse.json({ docs: [] })
    }

    const elAgent = await getElevenLabsAgent(agent.elevenlabsAgentId)
    const knowledgeBase = elAgent?.conversation_config?.agent?.prompt?.knowledge_base ?? []
    return NextResponse.json({ docs: knowledgeBase })
  } catch (error) {
    console.error("[GET /api/agents/:id/knowledge-base]", error)
    return NextResponse.json({ error: "Failed to fetch knowledge base" }, { status: 500 })
  }
}

// POST — add a file or URL to the knowledge base
export async function POST(req: NextRequest, { params }: Params) {
  try {
    const session = await auth()
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { id } = await params
    const agent = await db.agent.findUnique({ where: { id }, select: { userId: true, elevenlabsAgentId: true } })
    if (!agent) return NextResponse.json({ error: "Agent not found" }, { status: 404 })

    const isOwner = agent.userId === session.user.id
    const isAdmin = session.user.role === "ADMIN"
    if (!isOwner && !isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

    if (!agent.elevenlabsAgentId) {
      return NextResponse.json({ error: "Agent setup is not complete yet" }, { status: 400 })
    }

    // Get current KB to append to it
    const elAgent = await getElevenLabsAgent(agent.elevenlabsAgentId)
    const currentKB: { id: string; name: string; type: string; usage_mode: string }[] =
      elAgent?.conversation_config?.agent?.prompt?.knowledge_base ?? []

    let newDoc: { id: string; name: string }

    const contentType = req.headers.get("content-type") ?? ""

    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData()
      const file = formData.get("file") as File | null
      if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 })
      newDoc = await uploadKnowledgeBaseFile(file)
    } else {
      const body = await req.json()
      if (!body.url) return NextResponse.json({ error: "URL is required" }, { status: 400 })
      newDoc = await addKnowledgeBaseUrl(body.url, body.name)
    }

    // Determine type
    const type = contentType.includes("multipart/form-data") ? "file" : "url"

    // Attach to agent
    const updatedKB = [...currentKB, { id: newDoc.id, name: newDoc.name, type, usage_mode: "auto" }]
    await updateAgentKnowledgeBase(agent.elevenlabsAgentId, updatedKB)

    return NextResponse.json({ doc: { id: newDoc.id, name: newDoc.name, type, usage_mode: "auto" } })
  } catch (error: any) {
    console.error("[POST /api/agents/:id/knowledge-base]", error)
    return NextResponse.json({ error: error?.message ?? "Failed to add document" }, { status: 500 })
  }
}
