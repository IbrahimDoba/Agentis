import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { auth } from "@/lib/auth"
import bcrypt from "bcryptjs"

interface Params { params: Promise<{ token: string }> }

// GET — fetch invite details (used to pre-fill the accept page)
export async function GET(_req: NextRequest, { params }: Params) {
  const { token } = await params

  const invite = await db.workspaceMember.findUnique({
    where: { inviteToken: token },
    select: {
      id: true,
      email: true,
      role: true,
      status: true,
      invitedAt: true,
      workspace: { select: { name: true, businessName: true } },
    },
  })

  if (!invite) return NextResponse.json({ error: "Invalid invite link" }, { status: 404 })
  if (invite.status === "ACCEPTED") return NextResponse.json({ error: "This invite has already been accepted" }, { status: 409 })
  if (invite.status === "REVOKED") return NextResponse.json({ error: "This invite has been revoked" }, { status: 410 })

  // Check 7-day expiry
  const expiry = new Date(invite.invitedAt)
  expiry.setDate(expiry.getDate() + 7)
  if (new Date() > expiry) return NextResponse.json({ error: "This invite link has expired" }, { status: 410 })

  const existingUser = await db.user.findUnique({
    where: { email: invite.email },
    select: { id: true },
  })

  return NextResponse.json({
    email: invite.email,
    role: invite.role,
    ownerName: invite.workspace.name,
    ownerBusiness: invite.workspace.businessName,
    isExistingUser: !!existingUser,
  })
}

// POST — accept the invite (existing user or new signup)
export async function POST(req: NextRequest, { params }: Params) {
  const { token } = await params
  const body = await req.json()

  const invite = await db.workspaceMember.findUnique({
    where: { inviteToken: token },
    select: { id: true, email: true, status: true, invitedAt: true, workspaceId: true },
  })

  if (!invite) return NextResponse.json({ error: "Invalid invite link" }, { status: 404 })
  if (invite.status === "ACCEPTED") return NextResponse.json({ error: "Already accepted" }, { status: 409 })
  if (invite.status === "REVOKED") return NextResponse.json({ error: "Invite revoked" }, { status: 410 })

  const expiry = new Date(invite.invitedAt)
  expiry.setDate(expiry.getDate() + 7)
  if (new Date() > expiry) return NextResponse.json({ error: "Invite expired" }, { status: 410 })

  let userId: string

  const existingUser = await db.user.findUnique({ where: { email: invite.email } })

  if (existingUser) {
    // Existing user — just accept the invite
    userId = existingUser.id
  } else {
    // New user — create account from the form data
    const { name, password } = body
    if (!name || !password) {
      return NextResponse.json({ error: "Name and password are required" }, { status: 400 })
    }
    if (password.length < 8) {
      return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 })
    }

    const passwordHash = await bcrypt.hash(password, 12)
    const newUser = await db.user.create({
      data: {
        name,
        email: invite.email,
        businessName: name, // placeholder — they're a team member, not an owner
        passwordHash,
        emailVerified: true,
        status: "APPROVED", // invited users are pre-approved
        onboardingCompleted: true, // skip onboarding
      },
    })
    userId = newUser.id
  }

  // Accept the invite
  await db.workspaceMember.update({
    where: { id: invite.id },
    data: {
      status: "ACCEPTED",
      userId,
      inviteToken: null, // invalidate token
      joinedAt: new Date(),
    },
  })

  // Return the session so the frontend can sign the user in
  const session = await auth()
  return NextResponse.json({
    success: true,
    isExistingUser: !!existingUser,
    email: invite.email,
    workspaceId: invite.workspaceId,
    // If they're already logged in as the right user, redirect immediately
    alreadyLoggedIn: session?.user?.id === userId,
  })
}
