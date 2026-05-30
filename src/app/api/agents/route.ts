import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { agentSchema } from "@/lib/validations"
import { sendAgentSubmittedNotification } from "@/lib/email"
import { getWorkspaceContext } from "@/lib/workspace"
import { syncProductImagesToOrchestratorMedia } from "@/lib/orchestrator-media-sync"
import { buildOrchestratorSystemPrompt } from "@/lib/orchestratorSync"

export async function GET(req: NextRequest) {
  try {
    const session = await auth()

    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { ownerId } = await getWorkspaceContext(session.user.id)

    // Sort by most-recent conversation activity (with createdAt as the
    // fallback for brand-new agents). Dashboard home auto-selects [0] and
    // we want "the agent the user is actually using" to win — not the
    // newest one they happened to create. Single raw SQL is the cleanest
    // way to do this in Prisma 7 without ordering on a related _max field.
    const rows = await db.$queryRaw<
      Array<{ id: string; latestActivity: Date | null; createdAt: Date }>
    >`
      SELECT a."id",
             (SELECT MAX(c."lastActivityAt")
                FROM "Conversation" c
                WHERE c."agentId" = a."id") AS "latestActivity",
             a."createdAt"
      FROM "Agent" a
      WHERE a."userId" = ${ownerId}
      ORDER BY COALESCE(
                 (SELECT MAX(c."lastActivityAt")
                    FROM "Conversation" c
                    WHERE c."agentId" = a."id"),
                 a."createdAt"
               ) DESC
    `
    const orderedIds = rows.map((r) => r.id)

    if (orderedIds.length === 0) {
      return NextResponse.json([])
    }

    const agents = await db.agent.findMany({
      where: { id: { in: orderedIds } },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            businessName: true,
          },
        },
      },
    })
    // Re-sort by the activity-aware order from the raw query (Prisma's
    // findMany with `in` doesn't preserve input order).
    const indexById = new Map(orderedIds.map((id, i) => [id, i]))
    agents.sort((a, b) => (indexById.get(a.id) ?? 0) - (indexById.get(b.id) ?? 0))

    return NextResponse.json(
      (agents as any[]).map((a: any) => ({
        ...a,
        createdAt: a.createdAt.toISOString(),
        updatedAt: a.updatedAt.toISOString(),
      }))
    )
  } catch (error) {
    console.error("[GET /api/agents]", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth()

    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    if (session.user.status !== "APPROVED") {
      return NextResponse.json({ error: "Account not approved" }, { status: 403 })
    }

    // Check agent limit
    const user = await db.user.findUnique({
      where: { id: session.user.id },
      select: { maxAgents: true, _count: { select: { agents: true } } }
    })
    if (user && user._count.agents >= user.maxAgents) {
      return NextResponse.json(
        { error: "Agent limit reached. Contact support to create more agents." },
        { status: 403 }
      )
    }

    const body = await req.json()
    const parsed = agentSchema.safeParse(body)

    if (!parsed.success) {
      const errors: Record<string, string> = {}
      parsed.error.issues.forEach((err) => {
        const field = err.path[0] as string
        errors[field] = err.message
      })
      return NextResponse.json({ errors }, { status: 400 })
    }

    const {
      agentRuntime,
      orchestratorModel,
      orchestratorTemperature,
      orchestratorMaxTokens,
      ...agentData
    } = parsed.data

    let agent = await db.agent.create({
      data: {
        businessDescription: "",
        productsServices: "",
        faqs: "",
        operatingHours: "",
        ...agentData,
        businessName: agentData.businessName || session.user.businessName || "My Business",
        userId: session.user.id,
        agentRuntime: agentRuntime ?? "elevenlabs",
        ...(agentRuntime === "orchestrator" && { status: "ACTIVE", transportType: "baileys" }),
      },
    })

    // Create OrchestratorAgent when using DZero AI
    if (agentRuntime === "orchestrator") {
      await db.orchestratorAgent.create({
        data: {
          agentId: agent.id,
          name: agent.businessName,
          systemPrompt: buildOrchestratorSystemPrompt(agentData.responseGuidelines),
          model: orchestratorModel || "gpt-4o-mini",
          temperature: orchestratorTemperature ?? 0.7,
          maxOutputTokens: orchestratorMaxTokens ?? 800,
        },
      })

      if (Array.isArray(agentData.productsData) && agentData.productsData.length > 0) {
        const syncedProducts = await syncProductImagesToOrchestratorMedia(agent.id, agentData.productsData)
        const hasMediaIds = syncedProducts.some((p) => Boolean(p.mediaId))
        if (hasMediaIds) {
          agent = await db.agent.update({
            where: { id: agent.id },
            data: { productsData: syncedProducts as any },
          })
        }
      }
    }

    sendAgentSubmittedNotification({
      userName: session.user.name ?? "",
      userEmail: session.user.email ?? "",
      businessName: session.user.businessName ?? parsed.data.businessName,
      agentId: agent.id,
    }).catch((err) => console.error("[POST /api/agents] email error:", err))

    return NextResponse.json(
      {
        ...agent,
        createdAt: agent.createdAt.toISOString(),
        updatedAt: agent.updatedAt.toISOString(),
      },
      { status: 201 }
    )
  } catch (error) {
    console.error("[POST /api/agents]", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
