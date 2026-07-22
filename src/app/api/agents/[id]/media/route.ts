import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"

interface Params {
    params: Promise<{ id: string }>
}

const ORCHESTRATOR_URL = process.env.ORCHESTRATOR_URL || "http://localhost:4100"
const ORCHESTRATOR_API_KEY = process.env.ORCHESTRATOR_API_KEY

async function authorize(id: string) {
    const session = await auth()
    if (!session) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) }
    const agent = await db.agent.findUnique({ where: { id }, select: { userId: true } })
    if (!agent) return { error: NextResponse.json({ error: "Agent not found" }, { status: 404 }) }
    const isOwner = agent.userId === session.user.id
    const isAdmin = session.user.role === "ADMIN"
    if (!isOwner && !isAdmin) return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) }
    if (!ORCHESTRATOR_API_KEY) return { error: NextResponse.json({ error: "ORCHESTRATOR_API_KEY not configured" }, { status: 500 }) }
    return { ok: true as const }
}

export async function GET(_req: NextRequest, { params }: Params) {
    try {
        const { id } = await params
        const gate = await authorize(id)
        if ("error" in gate) return gate.error

        const res = await fetch(`${ORCHESTRATOR_URL}/v1/media?agentId=${id}`, {
            headers: { Authorization: `Bearer ${ORCHESTRATOR_API_KEY}` },
        })
        if (!res.ok) {
            const t = await res.text().catch(() => "")
            throw new Error(`Failed to fetch media (${res.status})${t ? `: ${t}` : ""}`)
        }
        return NextResponse.json(await res.json())
    } catch (error) {
        console.error("[GET /api/agents/:id/media]", error)
        return NextResponse.json({ error: "Failed to fetch media" }, { status: 500 })
    }
}

export async function POST(req: NextRequest, { params }: Params) {
    try {
        const { id } = await params
        const gate = await authorize(id)
        if ("error" in gate) return gate.error

        const formData = await req.formData()
        const file = formData.get("file") as File | null
        const description = (formData.get("description") as string | null)?.trim() || ""
        if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 })
        if (!description) return NextResponse.json({ error: "A description is required so the AI knows when to send it" }, { status: 400 })

        const buffer = Buffer.from(await file.arrayBuffer())
        const payload = {
            agentId: id,
            filename: file.name,
            mimeType: file.type || "application/octet-stream",
            description,
            contentBase64: buffer.toString("base64"),
        }

        const res = await fetch(`${ORCHESTRATOR_URL}/v1/media/upload`, {
            method: "POST",
            headers: { Authorization: `Bearer ${ORCHESTRATOR_API_KEY}`, "Content-Type": "application/json" },
            body: JSON.stringify(payload),
        })
        if (!res.ok) {
            const t = await res.text().catch(() => "")
            // Surface the orchestrator's own validation message (type/size) to the UI.
            let msg = `Upload failed (${res.status})`
            try { msg = JSON.parse(t).error ?? msg } catch { if (t) msg = t }
            return NextResponse.json({ error: msg }, { status: res.status === 400 ? 400 : 500 })
        }
        return NextResponse.json(await res.json())
    } catch (error: any) {
        console.error("[POST /api/agents/:id/media]", error)
        return NextResponse.json({ error: error?.message ?? "Failed to upload media" }, { status: 500 })
    }
}
