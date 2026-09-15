import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { z } from "zod"
import { sendAccountSuspendedEmail } from "@/lib/email"
import { calcCommission } from "@/lib/plans"
import { baileysClient } from "@/lib/baileys-client"

const updateSchema = z.object({
  status: z.enum(["PENDING", "APPROVED", "REJECTED", "SUSPENDED"]).optional(),
  role: z.enum(["USER", "ADMIN"]).optional(),
  maxAgents: z.number().int().min(1).max(20).optional(),
  plan: z.enum(["free", "basic", "starter", "pro", "enterprise"]).optional(),
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

    // If the admin is extending the subscription into the future, clear the
    // expiry-email tracking flags so the user gets fresh warning + expired
    // emails for the new cycle (otherwise we'd think they were already
    // notified for this period and silently skip them).
    const dataWithFlagReset: Record<string, unknown> = { ...parsed.data }
    if (
      parsed.data.subscriptionExpiresAt !== undefined &&
      parsed.data.subscriptionExpiresAt !== null &&
      parsed.data.subscriptionExpiresAt > new Date()
    ) {
      dataWithFlagReset.expiryWarningEmailSentAt = null
      dataWithFlagReset.expiredEmailSentAt = null
    }

    // When an admin moves a user onto (or between) a PAID plan without giving a
    // future expiry, start a fresh billing cycle. Otherwise the new plan keeps a
    // lapsed/old expiry and its monthly credits never apply — the user appears
    // to lose all their credits on a plan change. Skip if they explicitly set a
    // future expiry, or are still mid-cycle (leave that cycle intact).
    if (parsed.data.plan && parsed.data.plan !== "free") {
      const providedExpiry = parsed.data.subscriptionExpiresAt
      const hasFutureExpiry = providedExpiry instanceof Date && providedExpiry > new Date()
      if (!hasFutureExpiry) {
        const existing = await db.user.findUnique({
          where: { id },
          select: { subscriptionExpiresAt: true },
        })
        const stillActive =
          existing?.subscriptionExpiresAt != null && existing.subscriptionExpiresAt > new Date()
        if (!stillActive) {
          const start = new Date()
          const end = new Date(start)
          end.setMonth(end.getMonth() + 1)
          dataWithFlagReset.subscriptionExpiresAt = end
          dataWithFlagReset.currentPeriodStart = start
          dataWithFlagReset.subscriptionStatus = "active"
        }
      }
    }

    const user = await db.user.update({
      where: { id },
      data: dataWithFlagReset,
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

    if (parsed.data.status === "SUSPENDED") {
      sendAccountSuspendedEmail({ name: user.name, email: user.email })
        .catch((err) => console.error("[PATCH /api/users/:id] suspended email error:", err))

      // Drop every live WhatsApp session for this user. Setting the DB status
      // alone leaves the socket running in the worker — it keeps receiving,
      // replying and billing until torn down. Best-effort; the worker also
      // refuses to auto-reconnect a suspended user's sessions on restart.
      db.agent.findMany({ where: { userId: id }, select: { id: true } })
        .then((agents) =>
          Promise.all(
            agents.map((a) =>
              baileysClient.disconnectSession(a.id).catch((err) =>
                console.error(`[PATCH /api/users/:id] disconnect ${a.id} error:`, err),
              ),
            ),
          ),
        )
        .catch((err) => console.error("[PATCH /api/users/:id] suspend-disconnect error:", err))
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
