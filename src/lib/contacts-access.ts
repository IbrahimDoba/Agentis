import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { isFreeTrialExpired } from "@/lib/trial"

// Shared gate for the Status → Contacts routes: the agent exists, belongs to the
// caller (or an admin), and has a QR-linked WhatsApp session. Contact saving
// needs a linked phone; Meta Cloud API numbers have no address book to write to.
export async function assertContactsAccess(agentId: string, userId: string, role?: string, opts?: { spending?: boolean }) {
  const agent = await db.agent.findUnique({
    where: { id: agentId },
    select: {
      userId: true,
      autoSaveContacts: true,
      contactNameTag: true,
      user: { select: { plan: true, resellerId: true, subscriptionExpiresAt: true, creditBalance: true, creditsExpireAt: true } },
      baileysSession: { select: { agentId: true } },
    },
  })

  if (!agent) return { error: NextResponse.json({ error: "Agent not found" }, { status: 404 }) }
  if (agent.userId !== userId && role !== "ADMIN") return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) }
  if (opts?.spending && isFreeTrialExpired(agent.user)) {
    return { error: NextResponse.json({ error: "Your free trial has ended. Choose a plan to keep saving contacts." }, { status: 402 }) }
  }
  if (!agent.baileysSession) {
    return { error: NextResponse.json({ error: "Saving contacts needs a WhatsApp number linked by QR code" }, { status: 400 }) }
  }
  return { agent }
}
