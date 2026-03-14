import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { NextResponse } from "next/server"

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
      phone: user.phone,
      businessName: user.businessName,
      role: user.role,
      status: user.status,
      createdAt: user.createdAt.toISOString(),
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
      status: agent.status,
      createdAt: agent.createdAt.toISOString(),
      updatedAt: agent.updatedAt.toISOString(),
    } : null,
  })
}
