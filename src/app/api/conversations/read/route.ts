import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"

// GET — return all read conversation IDs for user
export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const reads = await db.conversationRead.findMany({
    where: { userId: session.user.id },
    select: { conversationId: true },
  })

  return NextResponse.json({ readIds: reads.map((r) => r.conversationId) })
}

// POST — mark a conversation as read
export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { conversationId } = await req.json()
  if (!conversationId) return NextResponse.json({ error: "conversationId required" }, { status: 400 })

  await db.conversationRead.upsert({
    where: { conversationId_userId: { conversationId, userId: session.user.id } },
    create: {
      id: Math.random().toString(36).slice(2, 12),
      conversationId,
      userId: session.user.id,
    },
    update: { readAt: new Date() },
  })

  return NextResponse.json({ ok: true })
}
