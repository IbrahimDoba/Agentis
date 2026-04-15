import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { profileUpdateSchema } from "@/lib/validations"
import { NextRequest, NextResponse } from "next/server"

export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const user = await db.user.findUnique({
    where: { id: session.user.id },
    include: { agents: true },
  })

  if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const agent = user.agents[0] ?? null

  return NextResponse.json({
    user: {
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
      maxAgents: user.maxAgents,
      plan: user.plan,
      subscriptionExpiresAt: user.subscriptionExpiresAt ? user.subscriptionExpiresAt.toISOString() : null,
      onboardingCompleted: user.onboardingCompleted,
      referralsEnabled: user.referralsEnabled,
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
