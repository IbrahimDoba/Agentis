import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { agentSchema, adminAgentUpdateSchema } from "@/lib/validations"
import { sendAgentApprovedEmail } from "@/lib/email"
import { buildAndSyncElevenLabsPrompt } from "@/lib/agentSync"
import { setAgentWebhook, addCustomerHistoryTool, setWhatsAppAccountAgent } from "@/lib/elevenlabs"
import type { Product } from "@/types"
import { syncProductImagesToOrchestratorMedia } from "@/lib/orchestrator-media-sync"
import { buildOrchestratorSystemPrompt } from "@/lib/orchestratorSync"

interface Params {
  params: Promise<{ id: string }>
}

export async function GET(req: NextRequest, { params }: Params) {
  try {
    const session = await auth()

    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id } = await params

    const agent = await db.agent.findUnique({
      where: { id },
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

    if (!agent) {
      return NextResponse.json({ error: "Agent not found" }, { status: 404 })
    }

    const isOwner = agent.userId === session.user.id
    const isAdmin = session.user.role === "ADMIN"

    if (!isOwner && !isAdmin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    return NextResponse.json({
      ...agent,
      createdAt: agent.createdAt.toISOString(),
      updatedAt: agent.updatedAt.toISOString(),
    })
  } catch (error) {
    console.error("[GET /api/agents/:id]", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const session = await auth()

    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id } = await params

    const agent = await db.agent.findUnique({ where: { id } })

    if (!agent) {
      return NextResponse.json({ error: "Agent not found" }, { status: 404 })
    }

    const isOwner = agent.userId === session.user.id
    const isAdmin = session.user.role === "ADMIN"

    if (!isOwner && !isAdmin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const body = await req.json()

    if (isAdmin) {
      // Admins can update all fields including setup fields
      const schema = adminAgentUpdateSchema.merge(agentSchema.partial())
      const parsed = schema.safeParse(body)

      if (!parsed.success) {
        return NextResponse.json({ error: "Invalid data" }, { status: 400 })
      }

      // Strip orchestrator-only fields before passing to Agent table
      const {
        orchestratorModel: adminOrchModel,
        orchestratorTemperature: adminOrchTemp,
        orchestratorMaxTokens: adminOrchTokens,
        agentRuntime: _adminRt,
        ...adminAgentFields
      } = parsed.data as any

      let updated = await db.agent.update({
        where: { id },
        data: adminAgentFields,
        include: { user: { select: { name: true, email: true } } },
      })

      if (updated.agentRuntime === "orchestrator" && Array.isArray(parsed.data.productsData)) {
        const syncedProducts = await syncProductImagesToOrchestratorMedia(id, parsed.data.productsData as Product[])
        const hasMediaIds = syncedProducts.some((p) => Boolean(p.mediaId))
        if (hasMediaIds) {
          updated = await db.agent.update({
            where: { id },
            data: { productsData: syncedProducts as any },
            include: { user: { select: { name: true, email: true } } },
          })
        }
      }

      // Fire-and-forget: sync to ElevenLabs if agent is connected
      if (updated.elevenlabsAgentId) {
        buildAndSyncElevenLabsPrompt(updated.elevenlabsAgentId, {
          responseGuidelines: updated.responseGuidelines,
          productsData: updated.productsData as Product[] | null,
        }).catch((err) => console.error("[agentSync] ElevenLabs sync failed (admin):", err))

        // If elevenlabsAgentId was just set or updated, register the post-call webhook
        if (parsed.data.elevenlabsAgentId) {
          setAgentWebhook(updated.elevenlabsAgentId)
            .catch((err) => console.error("[agentSync] Webhook setup failed:", err))
        }

        // If a WhatsApp account was assigned, link it to the ElevenLabs agent
        if (parsed.data.whatsappPhoneNumberId && updated.elevenlabsAgentId) {
          setWhatsAppAccountAgent(parsed.data.whatsappPhoneNumberId, updated.elevenlabsAgentId)
            .catch((err) => console.error("[agentSync] WhatsApp account link failed:", err))
        }
      }

      // When an agent is approved, add the customer history tool
      if (parsed.data.status === "ACTIVE" && updated.elevenlabsAgentId) {
        addCustomerHistoryTool(updated.elevenlabsAgentId)
          .catch((err) => console.error("[agentSync] Customer history tool setup failed:", err))
      }

      // Sync OrchestratorAgent systemPrompt + model settings when config changes (admin)
      if (updated.agentRuntime === "orchestrator") {
        const newSystemPrompt = buildOrchestratorSystemPrompt(updated.responseGuidelines)
        const orchestratorUpdate: Record<string, unknown> = { systemPrompt: newSystemPrompt }
        if (adminOrchModel) orchestratorUpdate.model = adminOrchModel
        if (adminOrchTemp != null) orchestratorUpdate.temperature = adminOrchTemp
        if (adminOrchTokens != null) orchestratorUpdate.maxOutputTokens = adminOrchTokens
        await db.orchestratorAgent.updateMany({
          where: { agentId: id },
          data: orchestratorUpdate,
        })
      }

      if (parsed.data.status === "ACTIVE") {
        sendAgentApprovedEmail({
          userName: updated.user.name,
          userEmail: updated.user.email,
          businessName: updated.businessName,
          whatsappPhoneNumber: updated.whatsappPhoneNumber,
          whatsappAgentLink: updated.whatsappAgentLink,
        }).catch((err) => console.error("[PATCH /api/agents/:id] approved email error:", err))
      }

      return NextResponse.json({
        ...updated,
        createdAt: updated.createdAt.toISOString(),
        updatedAt: updated.updatedAt.toISOString(),
      })
    } else {
      // Regular users can only update agent content fields
      const parsed = agentSchema.partial().safeParse(body)

      if (!parsed.success) {
        const errors: Record<string, string> = {}
        parsed.error.issues.forEach((err) => {
          const field = err.path[0] as string
          errors[field] = err.message
        })
        return NextResponse.json({ errors }, { status: 400 })
      }

      // Strip orchestrator-only fields before passing to Agent table
      const { orchestratorModel, orchestratorTemperature, orchestratorMaxTokens, agentRuntime: _rt, ...agentFields } = parsed.data

      let updated = await db.agent.update({
        where: { id },
        data: agentFields,
      })

      if (updated.agentRuntime === "orchestrator" && Array.isArray(parsed.data.productsData)) {
        const syncedProducts = await syncProductImagesToOrchestratorMedia(id, parsed.data.productsData as Product[])
        const hasMediaIds = syncedProducts.some((p) => Boolean(p.mediaId))
        if (hasMediaIds) {
          updated = await db.agent.update({
            where: { id },
            data: { productsData: syncedProducts as any },
          })
        }
      }

      // Fire-and-forget: sync to ElevenLabs if agent is connected
      if (updated.elevenlabsAgentId) {
        buildAndSyncElevenLabsPrompt(updated.elevenlabsAgentId, {
          responseGuidelines: updated.responseGuidelines,
          productsData: updated.productsData as Product[] | null,
        }).catch((err) => console.error("[agentSync] ElevenLabs sync failed:", err))
      }

      // Sync OrchestratorAgent systemPrompt + model settings when config changes
      if (updated.agentRuntime === "orchestrator") {
        const newSystemPrompt = buildOrchestratorSystemPrompt(updated.responseGuidelines)
        const orchestratorUpdate: Record<string, unknown> = { systemPrompt: newSystemPrompt }
        if (orchestratorModel) orchestratorUpdate.model = orchestratorModel
        if (orchestratorTemperature != null) orchestratorUpdate.temperature = orchestratorTemperature
        if (orchestratorMaxTokens != null) orchestratorUpdate.maxOutputTokens = orchestratorMaxTokens
        await db.orchestratorAgent.updateMany({
          where: { agentId: id },
          data: orchestratorUpdate,
        })
      }

      return NextResponse.json({
        ...updated,
        createdAt: updated.createdAt.toISOString(),
        updatedAt: updated.updatedAt.toISOString(),
      })
    }
  } catch (error) {
    console.error("[PATCH /api/agents/:id]", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
