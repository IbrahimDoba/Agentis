import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"

interface Params {
    params: Promise<{ id: string }>
}

const ORCHESTRATOR_URL = process.env.ORCHESTRATOR_URL || "http://localhost:4100"
const ORCHESTRATOR_API_KEY = process.env.ORCHESTRATOR_API_KEY

const BodySchema = z.object({ url: z.string().trim().min(1).max(2048) })

/**
 * POST /api/agents/:id/documents/web — add a website link to the knowledge base.
 *
 * The orchestrator owns URL validation (it has the SSRF guard), so this proxies
 * its 4xx bodies straight through: the operator needs to read "that address is
 * not a public website", not a generic 500.
 */
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

        const parsed = BodySchema.safeParse(await req.json().catch(() => null))
        if (!parsed.success) return NextResponse.json({ error: "A website address is required" }, { status: 400 })

        const res = await fetch(`${ORCHESTRATOR_URL}/v1/documents/web`, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${ORCHESTRATOR_API_KEY}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ agentId: id, url: parsed.data.url }),
        })

        const data = await res.json().catch(() => ({}))
        if (!res.ok) {
            return NextResponse.json(
                { error: data?.error ?? "Could not add that website" },
                { status: res.status >= 400 && res.status < 500 ? res.status : 500 }
            )
        }

        return NextResponse.json(data, { status: 202 })
    } catch (error) {
        console.error("[POST /api/agents/:id/documents/web]", error)
        return NextResponse.json({ error: "Failed to add website" }, { status: 500 })
    }
}
