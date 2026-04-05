import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { getConversation } from "@/lib/elevenlabs"

interface Params {
  params: Promise<{ id: string; convId: string }>
}

/**
 * Maps an ElevenLabs raw transcript turn to the shape expected by the frontend.
 * ElevenLabs provides media via source_medium + file_input.file_url.
 * Signed URLs expire in ~15 minutes so we always fetch fresh from ElevenLabs.
 */
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
  // Documents, PDFs, etc.
  return { ...base, document_url: file.file_url, document_name: file.original_filename ?? "File" }
}

export async function GET(_req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id, convId } = await params
  const agent = await db.agent.findUnique({
    where: { id },
    select: { userId: true, elevenlabsAgentId: true },
  })

  if (!agent) return NextResponse.json({ error: "Agent not found" }, { status: 404 })

  const isOwner = agent.userId === session.user.id
  const isAdmin = session.user.role === "ADMIN"
  if (!isOwner && !isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  // Always fetch from ElevenLabs for the detail view — signed media URLs expire quickly
  try {
    const data = await getConversation(convId)

    // Backfill phoneNumber in DB if missing — the list API doesn't return user_id but the detail does
    if (data.user_id) {
      const jidMatch = (data.user_id as string).match(/^(\d+)[:@]/)
      const phone = jidMatch ? jidMatch[1] : (data.user_id as string).replace(/\D/g, "")
      if (phone.length >= 7) {
        db.conversationLog.updateMany({
          where: { conversationId: convId, phoneNumber: null },
          data: { phoneNumber: phone },
        }).catch(() => {/* non-fatal */})
      }
    }

    return NextResponse.json({
      ...data,
      transcript: (data.transcript ?? []).map(mapTurn),
    })
  } catch {
    // Fall back to DB if ElevenLabs is unavailable
    const log = await db.conversationLog.findUnique({
      where: { conversationId: convId },
      select: {
        conversationId: true,
        phoneNumber: true,
        transcript: true,
        summary: true,
        durationSecs: true,
        startTime: true,
        createdAt: true,
        status: true,
        rawPayload: true,
      },
    })

    if (!log) return NextResponse.json({ error: "Conversation not found" }, { status: 404 })

    const raw = log.rawPayload as Record<string, any> | null
    const analysis = raw?.analysis as Record<string, any> | undefined
    const transcript = Array.isArray(log.transcript) ? (log.transcript as any[]).map(mapTurn) : []

    return NextResponse.json({
      conversation_id: log.conversationId,
      start_time_unix_secs: log.startTime ? Math.floor(log.startTime.getTime() / 1000) : Math.floor(log.createdAt.getTime() / 1000),
      call_duration_secs: log.durationSecs ?? 0,
      message_count: transcript.length,
      transcript_summary: log.summary ?? analysis?.transcript_summary ?? null,
      call_summary_title: raw?.call_summary_title ?? null,
      call_successful: analysis?.call_successful ?? null,
      status: log.status ?? "done",
      user_id: log.phoneNumber ?? null,
      transcript,
    })
  }
}
