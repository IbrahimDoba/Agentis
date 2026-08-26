import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { z } from "zod"

// Read + configure the WhatsApp groups this agent has been added to. Rows are
// created by the worker on first sighting of group traffic, so this endpoint
// only ever reads and updates — there is no "add a group" here, you add the
// agent's number to the group from WhatsApp itself.

interface Params { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { id } = await params

  const agent = await db.agent.findFirst({
    where: { id, userId: session.user.id },
    select: { id: true, groupChatEnabled: true },
  })
  if (!agent) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const groups = await db.groupChat.findMany({
    where: { agentId: id },
    orderBy: [{ lastMessageAt: "desc" }, { joinedAt: "desc" }],
    select: {
      id: true,
      groupJid: true,
      subject: true,
      replyMode: true,
      conversationId: true,
      joinedAt: true,
      lastMessageAt: true,
    },
  })

  return NextResponse.json({
    groupChatEnabled: agent.groupChatEnabled,
    groups: groups.map((g) => ({
      ...g,
      joinedAt: g.joinedAt.toISOString(),
      lastMessageAt: g.lastMessageAt?.toISOString() ?? null,
    })),
  })
}

const patchSchema = z.object({
  groupId: z.string().min(1),
  replyMode: z.enum(["mention", "off"]),
})

export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { id } = await params

  const parsed = patchSchema.safeParse(await req.json())
  if (!parsed.success) {
    return NextResponse.json({ errors: parsed.error.flatten().fieldErrors }, { status: 400 })
  }

  // Scoped on agentId AND the session's userId so one tenant can never flip
  // another's group. updateMany (not update) so a miss is a 404, not a throw.
  const result = await db.groupChat.updateMany({
    where: {
      id: parsed.data.groupId,
      agentId: id,
      agent: { userId: session.user.id },
    },
    data: { replyMode: parsed.data.replyMode },
  })
  if (result.count === 0) return NextResponse.json({ error: "Not found" }, { status: 404 })

  return NextResponse.json({ ok: true })
}
