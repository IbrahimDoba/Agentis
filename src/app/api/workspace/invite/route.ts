import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { PLAN_SEAT_LIMITS } from "@/lib/plans"
import { sendWorkspaceInviteEmail } from "@/lib/email"
import crypto from "crypto"

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { email, role } = await req.json()
  if (!email || !role) return NextResponse.json({ error: "Email and role are required" }, { status: 400 })
  if (!["ADMIN", "MEMBER"].includes(role)) return NextResponse.json({ error: "Invalid role" }, { status: 400 })

  const owner = await db.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, name: true, businessName: true, plan: true, status: true },
  })
  if (!owner || owner.status !== "APPROVED") {
    return NextResponse.json({ error: "Account not approved" }, { status: 403 })
  }

  // Seat limit check
  const seatLimit = PLAN_SEAT_LIMITS[owner.plan] ?? 0
  if (seatLimit === 0) {
    return NextResponse.json({ error: "Team members are not available on your current plan. Upgrade to Starter or Pro." }, { status: 403 })
  }

  if (seatLimit !== -1) {
    const currentCount = await db.workspaceMember.count({
      where: { workspaceId: owner.id, status: { in: ["PENDING", "ACCEPTED"] } },
    })
    if (currentCount >= seatLimit) {
      return NextResponse.json({
        error: `You've reached your seat limit (${seatLimit} members). Upgrade your plan to invite more.`,
      }, { status: 403 })
    }
  }

  // Can't invite yourself
  if (email.toLowerCase() === (await db.user.findUnique({ where: { id: owner.id }, select: { email: true } }))?.email?.toLowerCase()) {
    return NextResponse.json({ error: "You can't invite yourself" }, { status: 400 })
  }

  // Check if already invited
  const existing = await db.workspaceMember.findUnique({
    where: { workspaceId_email: { workspaceId: owner.id, email: email.toLowerCase() } },
  })
  if (existing?.status === "ACCEPTED") {
    return NextResponse.json({ error: "This person is already a member of your workspace" }, { status: 409 })
  }

  const inviteToken = crypto.randomBytes(32).toString("hex")
  const inviteLink = `${process.env.NEXTAUTH_URL}/invite/${inviteToken}`

  // Check if invitee has an existing D-Zero account
  const existingUser = await db.user.findUnique({ where: { email: email.toLowerCase() }, select: { id: true } })

  // Upsert the invite (re-invite replaces the old token)
  await db.workspaceMember.upsert({
    where: { workspaceId_email: { workspaceId: owner.id, email: email.toLowerCase() } },
    create: {
      workspaceId: owner.id,
      email: email.toLowerCase(),
      role,
      status: "PENDING",
      inviteToken,
      userId: existingUser?.id ?? null,
    },
    update: {
      role,
      status: "PENDING",
      inviteToken,
      invitedAt: new Date(),
      userId: existingUser?.id ?? null,
    },
  })

  await sendWorkspaceInviteEmail({
    inviteeEmail: email.toLowerCase(),
    ownerName: owner.name,
    ownerBusiness: owner.businessName,
    role,
    inviteLink,
    isExistingUser: !!existingUser,
  })

  return NextResponse.json({ success: true })
}
