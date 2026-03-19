import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { agentSchema, adminAgentUpdateSchema } from "@/lib/validations"
import { sendAgentApprovedEmail } from "@/lib/email"

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

      const updated = await db.agent.update({
        where: { id },
        data: parsed.data,
        include: { user: { select: { name: true, email: true } } },
      })

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

      const updated = await db.agent.update({
        where: { id },
        data: parsed.data,
      })

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
