import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { isFreeTrialExpired } from "@/lib/trial"

// Shared gate for the Status routes: the agent exists, belongs to the caller (or
// an admin), and has a QR-linked WhatsApp session. Contacts and status both need
// a linked phone; Meta Cloud API numbers have no address book or status.
const DOING = { contacts: "saving contacts", status: "posting to your status" } as const

export async function assertContactsAccess(
  agentId: string,
  userId: string,
  role?: string,
  opts?: { spending?: boolean; feature?: keyof typeof DOING },
) {
  const doing = DOING[opts?.feature ?? "contacts"]
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
    return { error: NextResponse.json({ error: `Your free trial has ended. Choose a plan to keep ${doing}.` }, { status: 402 }) }
  }
  if (!agent.baileysSession) {
    return { error: NextResponse.json({ error: `${doing[0].toUpperCase()}${doing.slice(1)} needs a WhatsApp number linked by QR code` }, { status: 400 }) }
  }
  return { agent }
}
