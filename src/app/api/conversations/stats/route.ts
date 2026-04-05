import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { NextResponse } from "next/server"

export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const agent = await db.agent.findFirst({
    where: { userId: session.user.id },
    select: { id: true, elevenlabsAgentId: true },
  })

  const agentFilter = agent
    ? {
        OR: [
          { agentId: agent.id },
          ...(agent.elevenlabsAgentId ? [{ elevenlabsAgentId: agent.elevenlabsAgentId }] : []),
        ],
      }
    : null

  const [totalConversations, totalLeads, totalContacts] = await Promise.all([
    agentFilter ? db.conversationLog.count({ where: agentFilter }) : 0,
    db.lead.count({ where: { userId: session.user.id } }),
    agentFilter
      ? db.conversationLog.groupBy({
          by: ["phoneNumber"],
          where: { ...agentFilter, phoneNumber: { not: null } },
        }).then((r) => r.length)
      : 0,
  ])

  return NextResponse.json({ totalConversations, totalLeads, totalContacts })
}
