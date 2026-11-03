import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { formatMb, mediaSizeError, MAX_DOCUMENT_BYTES } from "@/lib/media-limits"

interface Params {
    params: Promise<{ id: string }>
}

const ORCHESTRATOR_URL = process.env.ORCHESTRATOR_URL || "http://localhost:4100"
const ORCHESTRATOR_API_KEY = process.env.ORCHESTRATOR_API_KEY
// Room for the multipart boundary and the description field around the file.
const MAX_REQUEST_BYTES = MAX_DOCUMENT_BYTES + 1024 * 1024

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

        // Checked before parsing: formData() buffers the whole body in memory.
        if (Number(req.headers.get("content-length") ?? 0) > MAX_REQUEST_BYTES) {
            return NextResponse.json({ error: `This file is too large. The limit is ${formatMb(MAX_DOCUMENT_BYTES)}.` }, { status: 400 })
        }

        const formData = await req.formData()
        const file = formData.get("file") as File | null
        const description = (formData.get("description") as string | null)?.trim() || ""
        if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 })
        if (!description) return NextResponse.json({ error: "A description is required so the AI knows when to send it" }, { status: 400 })

        const sizeError = mediaSizeError(file.size, file.type)
        if (sizeError) return NextResponse.json({ error: sizeError }, { status: 400 })

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
            console.error("[POST /api/agents/:id/media] orchestrator rejected upload", { status: res.status, size: file.size, type: file.type, body: t.slice(0, 200) })
            // Only its 400s are written for the user (type/size). Anything else is
            // a framework or proxy error, like Fastify's "Payload Too Large".
            if (res.status === 413) return NextResponse.json({ error: "This file is too large to upload." }, { status: 400 })
            if (res.status !== 400) return NextResponse.json({ error: "Failed to upload media" }, { status: 500 })
            let msg = "Upload failed"
            try { msg = JSON.parse(t).error ?? msg } catch { /* not JSON: keep the generic message */ }
            return NextResponse.json({ error: msg }, { status: 400 })
        }
        return NextResponse.json(await res.json())
    } catch (error) {
        console.error("[POST /api/agents/:id/media]", error)
        return NextResponse.json({ error: "Failed to upload media" }, { status: 500 })
    }
}
