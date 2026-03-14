import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { NextResponse } from "next/server"

export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const agent = await db.agent.findFirst({
    where: { userId: session.user.id },
  })

  if (!agent) return NextResponse.json({ agent: null })

  return NextResponse.json({
    agent: {
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
    },
  })
}
