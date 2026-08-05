import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { profileUpdateSchema } from "@/lib/validations"
import { getWorkspaceContext } from "@/lib/workspace"
import { NextRequest, NextResponse } from "next/server"

export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { ownerId, isOwner } = await getWorkspaceContext(session.user.id)

  const user = await db.user.findUnique({
    where: { id: ownerId },
    include: { agents: true },
  })

  if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const agent = user.agents[0] ?? null

  return NextResponse.json({
    isOwnWorkspace: isOwner,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone ?? null,
      businessName: user.businessName,
      role: user.role,
      status: user.status,
      resellerId: user.resellerId,
      createdAt: user.createdAt.toISOString(),
      businessCategory: user.businessCategory ?? null,
      businessDescription: user.businessDescription ?? null,
      businessAddress: user.businessAddress ?? null,
      businessEmail: user.businessEmail ?? null,
      businessWebsite: user.businessWebsite ?? null,
      maxAgents: user.maxAgents,
      plan: user.plan,
      subscriptionExpiresAt: user.subscriptionExpiresAt ? user.subscriptionExpiresAt.toISOString() : null,
      onboardingCompleted: user.onboardingCompleted,
      referralsEnabled: user.referralsEnabled,
      developerModeEnabled: user.developerModeEnabled,
      leadNotificationsEnabled: user.leadNotificationsEnabled,
      appointmentReminder1Minutes: user.appointmentReminder1Minutes,
      appointmentReminder2Minutes: user.appointmentReminder2Minutes,
      hasPassword: Boolean(user.passwordHash),
    },
    agent: agent ? {
      id: agent.id,
      userId: agent.userId,
      businessName: agent.businessName,
      businessDescription: agent.businessDescription,
      productsServices: agent.productsServices,
      faqs: agent.faqs,
      operatingHours: agent.operatingHours,
      websiteLinks: agent.websiteLinks ?? undefined,
      responseGuidelines: agent.responseGuidelines ?? undefined,
      profileImageUrl: agent.profileImageUrl ?? undefined,
      whatsappBusinessName: agent.whatsappBusinessName ?? undefined,
      whatsappAgentLink: agent.whatsappAgentLink ?? undefined,
      whatsappPhoneNumber: agent.whatsappPhoneNumber ?? undefined,
      qrCodeUrl: agent.qrCodeUrl ?? undefined,
      elevenlabsAgentId: agent.elevenlabsAgentId ?? undefined,
      messagingEnabled: agent.messagingEnabled,
      status: agent.status,
      createdAt: agent.createdAt.toISOString(),
      updatedAt: agent.updatedAt.toISOString(),
    } : null,
  })
}

export async function PATCH(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await req.json()
  // Handle referralsEnabled toggle separately (simple boolean patch)
  if (typeof body.referralsEnabled === "boolean" && Object.keys(body).length === 1) {
    const user = await db.user.update({
      where: { id: session.user.id },
      data: { referralsEnabled: body.referralsEnabled },
    })
    return NextResponse.json({ referralsEnabled: user.referralsEnabled })
  }

  // Developer mode toggle — same simple single-boolean patch shape.
  if (typeof body.developerModeEnabled === "boolean" && Object.keys(body).length === 1) {
    const user = await db.user.update({
      where: { id: session.user.id },
      data: { developerModeEnabled: body.developerModeEnabled },
    })
    return NextResponse.json({ developerModeEnabled: user.developerModeEnabled })
  }

  // Lead & handoff email alerts toggle — same single-boolean patch shape.
  if (typeof body.leadNotificationsEnabled === "boolean" && Object.keys(body).length === 1) {
    const user = await db.user.update({
      where: { id: session.user.id },
      data: { leadNotificationsEnabled: body.leadNotificationsEnabled },
    })
    return NextResponse.json({ leadNotificationsEnabled: user.leadNotificationsEnabled })
  }

  // Default appointment-reminder lead times (minutes before the appointment).
  // 1..10080 min (up to a week); reminder 2 may be null to default new
  // appointments to a single reminder. Each field is patched independently.
  if (body.appointmentReminder1Minutes !== undefined || body.appointmentReminder2Minutes !== undefined) {
    const remWindow = 7 * 24 * 60
    const inRange = (n: unknown) => typeof n === "number" && Number.isInteger(n) && n >= 1 && n <= remWindow
    const data: { appointmentReminder1Minutes?: number; appointmentReminder2Minutes?: number | null } = {}
    if (body.appointmentReminder1Minutes !== undefined) {
      if (!inRange(body.appointmentReminder1Minutes)) {
        return NextResponse.json({ error: "appointmentReminder1Minutes must be 1–10080 minutes" }, { status: 400 })
      }
      data.appointmentReminder1Minutes = body.appointmentReminder1Minutes
    }
    if (body.appointmentReminder2Minutes !== undefined) {
      if (body.appointmentReminder2Minutes !== null && !inRange(body.appointmentReminder2Minutes)) {
        return NextResponse.json({ error: "appointmentReminder2Minutes must be 1–10080 minutes or null" }, { status: 400 })
      }
      data.appointmentReminder2Minutes = body.appointmentReminder2Minutes
    }
    const user = await db.user.update({ where: { id: session.user.id }, data })
    return NextResponse.json({
      appointmentReminder1Minutes: user.appointmentReminder1Minutes,
      appointmentReminder2Minutes: user.appointmentReminder2Minutes,
    })
  }

  const parsed = profileUpdateSchema.safeParse(body)

  if (!parsed.success) {
    const errors: Record<string, string> = {}
    parsed.error.issues.forEach((err) => {
      const field = err.path[0] as string
      errors[field] = err.message
    })
    return NextResponse.json({ errors }, { status: 400 })
  }

  const {
    name,
    phone,
    businessName,
    businessCategory,
    businessDescription,
    businessAddress,
    businessEmail,
    businessWebsite,
  } = parsed.data

  const user = await db.user.update({
    where: { id: session.user.id },
    data: {
      name,
      phone: phone || null,
      businessName,
      businessCategory: businessCategory || null,
      businessDescription: businessDescription || null,
      businessAddress: businessAddress || null,
      businessEmail: businessEmail || null,
      businessWebsite: businessWebsite || null,
    },
  })

  return NextResponse.json({
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone ?? null,
    businessName: user.businessName,
    role: user.role,
    status: user.status,
    createdAt: user.createdAt.toISOString(),
    businessCategory: user.businessCategory ?? null,
    businessDescription: user.businessDescription ?? null,
    businessAddress: user.businessAddress ?? null,
    businessEmail: user.businessEmail ?? null,
    businessWebsite: user.businessWebsite ?? null,
  })
}
