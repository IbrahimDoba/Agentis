import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"

// Extract phone number from ElevenLabs conversation metadata
// Same logic as getCallerIdentifier in utils.ts but returns raw (unformatted)
function extractPhoneNumber(metadata: Record<string, unknown> | undefined): string | null {
  if (!metadata) return null
  const phone =
    (metadata.from_number as string) ||
    (metadata.caller_id as string) ||
    ((metadata.phone_call as Record<string, string> | undefined)?.external_number) ||
    ((metadata.phone_call as Record<string, string> | undefined)?.from) ||
    (metadata.initiator_identifier as string)
  return phone || null
}

export async function POST(req: NextRequest) {
  // Verify shared secret
  const secret = req.headers.get("x-webhook-secret")
  if (secret !== process.env.ELEVENLABS_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  let payload: Record<string, unknown>
  try {
    payload = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  // ElevenLabs sends different event types — we only care about post-call
  const eventType = payload.type ?? payload.event_type
  if (eventType !== "post_call_transcription") {
    return NextResponse.json({ received: true })
  }

  const conversationId = payload.conversation_id as string | undefined
  const elevenlabsAgentId = payload.agent_id as string | undefined

  if (!conversationId || !elevenlabsAgentId) {
    return NextResponse.json({ error: "Missing conversation_id or agent_id" }, { status: 400 })
  }

  // Pull fields out of payload
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const transcript = ((payload.transcript as Record<string, unknown>[]) ?? []) as any
  const metadata = payload.metadata as Record<string, unknown> | undefined
  const analysis = payload.analysis as Record<string, unknown> | undefined

  const phoneNumber = extractPhoneNumber(metadata)
  const summary = (analysis?.transcript_summary ?? payload.transcript_summary) as string | undefined
  const durationSecs = (metadata?.call_duration_secs ?? payload.call_duration_secs) as number | undefined
  const startTimeUnix = (metadata?.start_time_unix_secs ?? payload.start_time_unix_secs) as number | undefined
  const status = payload.status as string | undefined

  // Find the matching agent in our DB by ElevenLabs agent ID
  const agent = await db.agent.findFirst({
    where: { elevenlabsAgentId },
    select: { id: true },
  })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const raw = payload as any

  // Upsert — if somehow we receive the same conversation twice, update it
  await db.conversationLog.upsert({
    where: { conversationId },
    create: {
      conversationId,
      elevenlabsAgentId,
      agentId: agent?.id ?? null,
      phoneNumber: phoneNumber ?? null,
      transcript: raw.transcript ?? [],
      summary: summary ?? null,
      durationSecs: durationSecs ?? null,
      startTime: startTimeUnix ? new Date(startTimeUnix * 1000) : null,
      status: status ?? null,
      rawPayload: raw,
    },
    update: {
      phoneNumber: phoneNumber ?? null,
      transcript: raw.transcript ?? [],
      summary: summary ?? null,
      durationSecs: durationSecs ?? null,
      status: status ?? null,
      rawPayload: raw,
    },
  })

  return NextResponse.json({ received: true })
}
