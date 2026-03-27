import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { agentSchema } from "@/lib/validations"
import { sendAgentSubmittedNotification } from "@/lib/email"

export async function GET(req: NextRequest) {
  try {
    const session = await auth()

    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const isAdmin = session.user.role === "ADMIN"

    const agents = await db.agent.findMany({
      where: isAdmin ? {} : { userId: session.user.id },
      orderBy: { createdAt: "desc" },
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

    const agent = await db.agent.create({
      data: {
        ...parsed.data,
        userId: session.user.id,
      },
    })

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
