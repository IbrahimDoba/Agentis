import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { getConversations, getConversation } from "@/lib/elevenlabs"

interface Params {
  params: Promise<{ id: string }>
}

// Extract phone from an ElevenLabs conversation detail response
function extractPhone(conv: Record<string, unknown>): string | null {
  // Top-level user_id (most reliable for WhatsApp)
  if (conv.user_id) {
    const uid = conv.user_id as string
    const digits = uid.replace(/\D/g, "")
    if (digits.length >= 7) return digits
  }

  // metadata.whatsapp.whatsapp_user_id
  const meta = conv.metadata as Record<string, unknown> | undefined
  if (meta) {
    const wa = meta.whatsapp as Record<string, unknown> | undefined
    if (wa?.whatsapp_user_id) {
      const digits = (wa.whatsapp_user_id as string).replace(/\D/g, "")
      if (digits.length >= 7) return digits
    }

    // Other metadata fields
    const candidates = [
      meta.from_number as string,
      meta.caller_id as string,
      (meta.phone_call as Record<string, string> | undefined)?.external_number,
      (meta.phone_call as Record<string, string> | undefined)?.from,
      meta.initiator_identifier as string,
    ]
    for (const c of candidates) {
      if (c) {
        const digits = c.replace(/\D/g, "")
        if (digits.length >= 7) return digits
      }
    }
  }

  return null
}

export async function GET(_req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  const agent = await db.agent.findUnique({
    where: { id },
    select: { userId: true, elevenlabsAgentId: true },
  })

  if (!agent) return NextResponse.json({ error: "Agent not found" }, { status: 404 })

  const isOwner = agent.userId === session.user.id
  const isAdmin = session.user.role === "ADMIN"
  if (!isOwner && !isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  if (!agent.elevenlabsAgentId) {
    return NextResponse.json({ conversations: [], has_more: false })
  }

  try {
    const data = await getConversations(agent.elevenlabsAgentId)
    const conversations: Record<string, unknown>[] = data.conversations ?? []

    // Step 1: Try to enrich from ConversationLog (fast, local DB)
    const convIds = conversations.map((c) => c.conversation_id as string)
    const logs = convIds.length
      ? await db.conversationLog.findMany({
          where: { conversationId: { in: convIds } },
          select: { conversationId: true, phoneNumber: true },
        })
      : []
    const phoneMap = new Map(logs.map((l) => [l.conversationId, l.phoneNumber]))

    // Step 2: For conversations still missing a phone, fetch detail from ElevenLabs
    const needDetail = conversations.filter((c) => {
      const hasPhone = c.user_id || phoneMap.get(c.conversation_id as string)
      return !hasPhone
    })

    if (needDetail.length > 0) {
      const details = await Promise.allSettled(
        needDetail.map((c) => getConversation(c.conversation_id as string))
      )
      details.forEach((result, i) => {
        if (result.status === "fulfilled") {
          const phone = extractPhone(result.value)
          if (phone) {
            phoneMap.set(needDetail[i].conversation_id as string, phone)
          }
        }
      })
    }

    // Step 3: Merge phone numbers into conversations
    const enriched = conversations.map((c) => {
      const convId = c.conversation_id as string
      // Already has user_id from list response
      if (c.user_id) return c
      // Got phone from DB or detail fetch
      const phone = phoneMap.get(convId)
      if (phone) return { ...c, user_id: phone }
      return c
    })

    return NextResponse.json({ ...data, conversations: enriched })
  } catch {
    return NextResponse.json({ error: "Failed to fetch conversations" }, { status: 502 })
  }
}
