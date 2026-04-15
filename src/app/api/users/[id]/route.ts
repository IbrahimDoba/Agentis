import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { z } from "zod"
import { sendAccountApprovedEmail, sendAccountRejectedEmail, sendAccountSuspendedEmail } from "@/lib/email"
import { calcCommission } from "@/lib/plans"

const updateSchema = z.object({
  status: z.enum(["PENDING", "APPROVED", "REJECTED", "SUSPENDED"]).optional(),
  role: z.enum(["USER", "ADMIN"]).optional(),
  maxAgents: z.number().int().min(1).max(20).optional(),
  plan: z.enum(["free", "starter", "pro", "enterprise"]).optional(),
  subscriptionExpiresAt: z.coerce.date().nullable().optional(),
})

interface Params {
  params: Promise<{ id: string }>
}

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const session = await auth()

    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    if (session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const { id } = await params
    const body = await req.json()
    const parsed = updateSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid data" }, { status: 400 })
    }

    const user = await db.user.update({
      where: { id },
      data: parsed.data,
    })

    // If plan changed to a paid plan, calculate commission for referrer
    if (parsed.data.plan && parsed.data.plan !== "free") {
      const referral = await db.referral.findUnique({
        where: { referredId: id },
        select: { id: true, status: true },
      })
      if (referral && referral.status === "PENDING") {
        const commission = calcCommission(parsed.data.plan)
        await db.referral.update({
          where: { id: referral.id },
          data: {
            status: "COMPLETED",
            commissionEarned: commission ?? undefined,
          },
        }).catch((err) => console.error("[PATCH /api/users/:id] referral update error:", err))
      }
    }

    if (parsed.data.status === "APPROVED") {
      sendAccountApprovedEmail({ name: user.name, email: user.email })
        .catch((err) => console.error("[PATCH /api/users/:id] approved email error:", err))
    } else if (parsed.data.status === "REJECTED") {
      sendAccountRejectedEmail({ name: user.name, email: user.email })
        .catch((err) => console.error("[PATCH /api/users/:id] rejected email error:", err))
    } else if (parsed.data.status === "SUSPENDED") {
      sendAccountSuspendedEmail({ name: user.name, email: user.email })
        .catch((err) => console.error("[PATCH /api/users/:id] suspended email error:", err))
    }

    const { passwordHash, ...safeUser } = user
    return NextResponse.json({
      ...safeUser,
      createdAt: safeUser.createdAt.toISOString(),
      updatedAt: safeUser.updatedAt.toISOString(),
    })
  } catch (error) {
    console.error("[PATCH /api/users/:id]", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
