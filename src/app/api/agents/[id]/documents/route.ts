import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"

interface Params {
    params: Promise<{ id: string }>
}

const ORCHESTRATOR_URL = process.env.ORCHESTRATOR_URL || "http://localhost:4100"
const ORCHESTRATOR_API_KEY = process.env.ORCHESTRATOR_API_KEY

export async function GET(req: NextRequest, { params }: Params) {
    try {
        const session = await auth()
        if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

        const { id } = await params
        const agent = await db.agent.findUnique({ where: { id }, select: { userId: true } })
        if (!agent) return NextResponse.json({ error: "Agent not found" }, { status: 404 })

        const isOwner = agent.userId === session.user.id
        const isAdmin = session.user.role === "ADMIN"
        if (!isOwner && !isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

        if (!ORCHESTRATOR_API_KEY) {
            return NextResponse.json({ error: "ORCHESTRATOR_API_KEY is not configured in the Next.js app" }, { status: 500 })
        }

        const res = await fetch(`${ORCHESTRATOR_URL}/v1/documents?agentId=${id}`, {
            headers: { Authorization: `Bearer ${ORCHESTRATOR_API_KEY}` }
        })

        if (!res.ok) {
            const errorText = await res.text().catch(() => "")
            throw new Error(`Failed to fetch documents (${res.status})${errorText ? `: ${errorText}` : ""}`)
        }
        const data = await res.json()

        return NextResponse.json(data)
    } catch (error) {
        console.error("[GET /api/agents/:id/documents]", error)
        return NextResponse.json({ error: "Failed to fetch documents" }, { status: 500 })
    }
}

export async function POST(req: NextRequest, { params }: Params) {
    try {
        const session = await auth()
        if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

        const { id } = await params
        const agent = await db.agent.findUnique({ where: { id }, select: { userId: true } })
        if (!agent) return NextResponse.json({ error: "Agent not found" }, { status: 404 })

        const isOwner = agent.userId === session.user.id
        const isAdmin = session.user.role === "ADMIN"
        if (!isOwner && !isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

        if (!ORCHESTRATOR_API_KEY) {
            return NextResponse.json({ error: "ORCHESTRATOR_API_KEY is not configured in the Next.js app" }, { status: 500 })
        }

        const formData = await req.formData()
        const file = formData.get("file") as File | null
        if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 })

        // Convert to base64 to send to fastify orchestrator
        const buffer = Buffer.from(await file.arrayBuffer())
        const contentBase64 = buffer.toString("base64")

        const payload = {
            agentId: id,
            filename: file.name,
            mimeType: file.type,
            contentBase64
        }

        const res = await fetch(`${ORCHESTRATOR_URL}/v1/documents/upload`, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${ORCHESTRATOR_API_KEY}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify(payload)
        })

        if (!res.ok) {
            const errorText = await res.text().catch(() => "")
            throw new Error(`Upload failed (${res.status})${errorText ? `: ${errorText}` : ""}`)
        }

        const data = await res.json()
        return NextResponse.json(data)
    } catch (error: any) {
        console.error("[POST /api/agents/:id/documents]", error)
        return NextResponse.json({ error: error?.message ?? "Failed to add document" }, { status: 500 })
    }
}
