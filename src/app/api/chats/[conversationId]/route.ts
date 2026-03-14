import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { getConversation } from "@/lib/elevenlabs"

interface Params {
  params: Promise<{ conversationId: string }>
}

export async function GET(req: NextRequest, { params }: Params) {
  try {
    const session = await auth()

    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { conversationId } = await params

    const data = await getConversation(conversationId)
    return NextResponse.json(data)
  } catch (error) {
    console.error("[GET /api/chats/:conversationId]", error)
    return NextResponse.json({ error: "Failed to fetch conversation" }, { status: 500 })
  }
}
