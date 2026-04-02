import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import OpenAI from "openai"

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

// Normalize any phone-like string to just digits (strips JID suffixes, whitespace, +, etc.)
// e.g. "2348012345678:123@s.whatsapp.net" → "2348012345678"
// e.g. "+234 801 234 5678" → "2348012345678"
function normalizePhone(raw: string): string | null {
  // Handle WhatsApp JID: take digits before the first : or @
  const jidMatch = raw.match(/^(\d+)[:@]/)
  const cleaned = jidMatch ? jidMatch[1] : raw.replace(/\D/g, "")
  return cleaned.length >= 7 ? cleaned : null
}

// Extract phone number from ElevenLabs conversation payload
function extractPhoneNumber(payload: Record<string, unknown>): string | null {
  // 1. Top-level user_id (most reliable for WhatsApp)
  if (payload.user_id) {
    const normalized = normalizePhone(payload.user_id as string)
    if (normalized) return normalized
  }

  const metadata = payload.metadata as Record<string, unknown> | undefined
  if (metadata) {
    // 2. metadata.whatsapp.whatsapp_user_id
    const wa = metadata.whatsapp as Record<string, unknown> | undefined
    if (wa?.whatsapp_user_id) {
      const normalized = normalizePhone(wa.whatsapp_user_id as string)
      if (normalized) return normalized
    }

    // 3. Other metadata fields
    const candidates = [
      metadata.from_number as string,
      metadata.caller_id as string,
      (metadata.phone_call as Record<string, string> | undefined)?.external_number,
      (metadata.phone_call as Record<string, string> | undefined)?.from,
      metadata.initiator_identifier as string,
    ]
    for (const c of candidates) {
      if (c) {
        const normalized = normalizePhone(c)
        if (normalized) return normalized
      }
    }
  }

  return null
}

// Build a new running summary by combining the existing one with this session's transcript
async function buildUpdatedSummary(
  existingSummary: string | null,
  transcript: { role: string; message: string }[],
  sessionSummary: string | undefined
): Promise<string> {
  if (transcript.length === 0 && !sessionSummary) return existingSummary ?? ""

  const sessionText = sessionSummary
    ?? transcript.map((m) => `${m.role === "user" ? "Customer" : "Agent"}: ${m.message}`).join("\n")

  const prompt = existingSummary
    ? `You are updating a running memory summary for a returning customer.

Existing summary of past conversations:
${existingSummary}

New conversation that just ended:
${sessionText}

Update the summary to include the new conversation. Keep it to 4–6 sentences max. Focus on: who the customer is, what they've asked about, what was resolved, any personal details or preferences mentioned, and their purchase/order history.`
    : `Summarise this customer conversation in 3–4 sentences. Focus on: what the customer wanted, what was resolved, and any personal details or preferences mentioned.

Conversation:
${sessionText}`

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.2,
    messages: [{ role: "user", content: prompt }],
    max_tokens: 300,
  })

  return completion.choices[0]?.message?.content?.trim() ?? existingSummary ?? ""
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const raw = payload as any
  const metadata = payload.metadata as Record<string, unknown> | undefined
  const analysis = payload.analysis as Record<string, unknown> | undefined
  const transcript: { role: string; message: string }[] = raw.transcript ?? []

  const phoneNumber = extractPhoneNumber(payload)
  const summary = (analysis?.transcript_summary ?? payload.transcript_summary) as string | undefined
  const durationSecs = (metadata?.call_duration_secs ?? payload.call_duration_secs) as number | undefined
  const startTimeUnix = (metadata?.start_time_unix_secs ?? payload.start_time_unix_secs) as number | undefined
  const status = payload.status as string | undefined

  // Find the matching agent in our DB by ElevenLabs agent ID
  const agent = await db.agent.findFirst({
    where: { elevenlabsAgentId },
    select: { id: true },
  })

  // Upsert customer record if we have a phone number
  let customerId: string | null = null
  if (phoneNumber) {
    const existing = await db.customer.findUnique({
      where: { phoneNumber },
      select: { id: true, conversationSummary: true },
    })

    // Build updated running summary in the background (don't block the response)
    const updatedSummary = await buildUpdatedSummary(
      existing?.conversationSummary ?? null,
      transcript,
      summary
    ).catch(() => existing?.conversationSummary ?? null)

    const customer = await db.customer.upsert({
      where: { phoneNumber },
      create: {
        phoneNumber,
        agentId: agent?.id ?? null,
        conversationSummary: updatedSummary ?? null,
        lastSeen: new Date(),
      },
      update: {
        conversationSummary: updatedSummary ?? undefined,
        lastSeen: new Date(),
      },
    })
    customerId = customer.id
  }

  // Save the conversation log, linked to the customer
  await db.conversationLog.upsert({
    where: { conversationId },
    create: {
      conversationId,
      elevenlabsAgentId,
      agentId: agent?.id ?? null,
      customerId,
      phoneNumber: phoneNumber ?? null,
      transcript: raw.transcript ?? [],
      summary: summary ?? null,
      durationSecs: durationSecs ?? null,
      startTime: startTimeUnix ? new Date(startTimeUnix * 1000) : null,
      status: status ?? null,
      rawPayload: raw,
    },
    update: {
      customerId,
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
