import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"

interface Params {
    params: Promise<{ id: string; mediaId: string }>
}

const ORCHESTRATOR_URL = process.env.ORCHESTRATOR_URL || "http://localhost:4100"
const ORCHESTRATOR_API_KEY = process.env.ORCHESTRATOR_API_KEY

export async function DELETE(_req: NextRequest, { params }: Params) {
    try {
        const session = await auth()
        if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

        const { id, mediaId } = await params
        const agent = await db.agent.findUnique({ where: { id }, select: { userId: true } })
        if (!agent) return NextResponse.json({ error: "Agent not found" }, { status: 404 })

        const isOwner = agent.userId === session.user.id
        const isAdmin = session.user.role === "ADMIN"
        if (!isOwner && !isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

        const res = await fetch(`${ORCHESTRATOR_URL}/v1/media/${mediaId}`, {
            method: "DELETE",
            headers: { Authorization: `Bearer ${ORCHESTRATOR_API_KEY}` },
        })
        if (!res.ok) throw new Error("Failed to delete media")

        return new NextResponse(null, { status: 204 })
    } catch (error: any) {
        console.error("[DELETE /api/agents/:id/media/:mediaId]", error)
        return NextResponse.json({ error: error?.message ?? "Failed to delete media" }, { status: 500 })
    }
}
