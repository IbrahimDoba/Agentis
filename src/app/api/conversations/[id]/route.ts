import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { getConversation } from "@/lib/elevenlabs"
import { NextResponse } from "next/server"

function mapTurn(turn: any) {
  const medium: string = turn.source_medium ?? "text"
  const file = turn.file_input as { file_url?: string; mime_type?: string; original_filename?: string } | null

  const base = {
    role: turn.role,
    message: turn.message ?? null,
    time_in_call_secs: turn.time_in_call_secs ?? 0,
    source_medium: medium,
  }

  if (!file?.file_url) return base

  const mime = file.mime_type ?? ""

  if (medium === "image" || mime.startsWith("image/")) {
    return { ...base, image_url: file.file_url }
  }
  if (medium === "audio" || mime.startsWith("audio/")) {
    return { ...base, audio_url: file.file_url }
  }
  if (medium === "video" || mime.startsWith("video/")) {
    return { ...base, video_url: file.file_url }
  }
  return { ...base, document_url: file.file_url, document_name: file.original_filename ?? "File" }
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params

  // Verify the user owns an agent connected to ElevenLabs
  const agent = await db.agent.findFirst({
    where: { userId: session.user.id },
  })

  if (!agent?.elevenlabsAgentId) {
    return NextResponse.json({ error: "No active agent" }, { status: 403 })
  }

  try {
    const data = await getConversation(id)

    // Backfill phoneNumber in DB if missing — the list API doesn't return user_id but the detail does
    if (data.user_id) {
      const jidMatch = (data.user_id as string).match(/^(\d+)[:@]/)
      const phone = jidMatch ? jidMatch[1] : (data.user_id as string).replace(/\D/g, "")
      if (phone.length >= 7) {
        db.conversationLog.updateMany({
          where: { conversationId: id, phoneNumber: null },
          data: { phoneNumber: phone },
        }).catch(() => {/* non-fatal */})
      }
    }

    return NextResponse.json({
      ...data,
      transcript: (data.transcript ?? []).map(mapTurn),
    })
  } catch {
    return NextResponse.json({ error: "Failed to fetch conversation" }, { status: 502 })
  }
}
