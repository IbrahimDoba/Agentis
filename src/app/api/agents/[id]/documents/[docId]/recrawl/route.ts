import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"

interface Params {
    params: Promise<{ id: string; docId: string }>
}

const ORCHESTRATOR_URL = process.env.ORCHESTRATOR_URL || "http://localhost:4100"
const ORCHESTRATOR_API_KEY = process.env.ORCHESTRATOR_API_KEY

/**
 * POST /api/agents/:id/documents/:docId/recrawl — re-read a website link.
 *
 * The existing content keeps serving until the new crawl commits, so this is
 * safe to press at any time.
 */
export async function POST(req: NextRequest, { params }: Params) {
    try {
        const session = await auth()
        if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

        const { id, docId } = await params
        const agent = await db.agent.findUnique({ where: { id }, select: { userId: true } })
        if (!agent) return NextResponse.json({ error: "Agent not found" }, { status: 404 })

        const isOwner = agent.userId === session.user.id
        const isAdmin = session.user.role === "ADMIN"
        if (!isOwner && !isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

        if (!ORCHESTRATOR_API_KEY) {
            return NextResponse.json({ error: "ORCHESTRATOR_API_KEY is not configured in the Next.js app" }, { status: 500 })
        }

        const res = await fetch(
            `${ORCHESTRATOR_URL}/v1/documents/${docId}/recrawl?agentId=${encodeURIComponent(id)}`,
            { method: "POST", headers: { Authorization: `Bearer ${ORCHESTRATOR_API_KEY}` } }
        )

        const data = await res.json().catch(() => ({}))
        if (!res.ok) {
            return NextResponse.json(
                { error: data?.error ?? "Could not refresh that website" },
                { status: res.status >= 400 && res.status < 500 ? res.status : 500 }
            )
        }

        return NextResponse.json(data, { status: 202 })
    } catch (error) {
        console.error("[POST /api/agents/:id/documents/:docId/recrawl]", error)
        return NextResponse.json({ error: "Failed to refresh website" }, { status: 500 })
    }
}
