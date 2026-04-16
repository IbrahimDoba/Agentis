import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import OpenAI from "openai"
import { verifyElevenLabsSignature } from "@/lib/webhookAuth"

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

// Normalize any phone-like string to just digits (strips JID suffixes, whitespace, +, etc.)
// e.g. "2348012345678:123@s.whatsapp.net" → "2348012345678"
// e.g. "+234 801 234 5678" → "2348012345678"
function normalizePhone(raw: string): string | null {
  const jidMatch = raw.match(/^(\d+)[:@]/)
  const cleaned = jidMatch ? jidMatch[1] : raw.replace(/\D/g, "")
  if (cleaned.length < 7) return null
  // Convert local format (leading 0) to Nigerian international format
  if (cleaned.startsWith("0")) return "234" + cleaned.slice(1)
  return cleaned
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

// Build a plain-text fallback summary from transcript lines (used when GPT is unavailable)
function buildFallbackSummary(
  transcript: { role: string; message: string }[],
  sessionSummary: string | undefined,
  existingSummary: string | null
): string {
  if (sessionSummary?.trim()) return sessionSummary.trim()
  if (transcript.length > 0) {
    // Take last 8 turns max to stay concise
    const lines = transcript
      .slice(-8)
      .map((m) => `${m.role === "user" ? "Customer" : "Agent"}: ${m.message}`)
      .join("\n")
    return `Recent conversation:\n${lines}`
  }
  return existingSummary ?? ""
}

// Extract a first name from transcript (simple regex, no GPT needed)
function extractNameFallback(
  transcript: { role: string; message: string }[],
  existingName: string | null
): string | null {
  if (existingName) return existingName
  // Look for "my name is X" or "I'm X" or "I am X" in customer turns
  for (const turn of transcript) {
    if (turn.role !== "user") continue
    const m = turn.message.match(/(?:my name is|i'm|i am)\s+([A-Z][a-z]+)/i)
    if (m) return m[1]
  }
  return null
}

// Build a new running summary and extract customer name from the conversation
async function buildUpdatedSummary(
  existingSummary: string | null,
  existingName: string | null,
  transcript: { role: string; message: string }[],
  sessionSummary: string | undefined
): Promise<{ summary: string; name: string | null }> {
  if (transcript.length === 0 && !sessionSummary) {
    return { summary: existingSummary ?? "", name: existingName }
  }

  const sessionText = sessionSummary
    ?? transcript.map((m) => `${m.role === "user" ? "Customer" : "Agent"}: ${m.message}`).join("\n")

  const prompt = existingSummary
    ? `You are updating a running memory summary for a returning customer.

Existing summary of past conversations:
${existingSummary}

New conversation that just ended:
${sessionText}

Respond with JSON only, no markdown. Format:
{"summary": "...", "name": "first name if mentioned, or null"}

Update the summary to include the new conversation. Keep it to 4–6 sentences max. Focus on: who the customer is, what they've asked about, what was resolved, any personal details or preferences mentioned, and their purchase/order history.`
    : `Summarise this customer conversation. Respond with JSON only, no markdown. Format:
{"summary": "...", "name": "first name if mentioned, or null"}

Summary should be 3–4 sentences focusing on: what the customer wanted, what was resolved, and any personal details or preferences mentioned.

Conversation:
${sessionText}`

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.2,
      messages: [{ role: "user", content: prompt }],
      max_tokens: 400,
      response_format: { type: "json_object" },
    })

    const parsed = JSON.parse(completion.choices[0]?.message?.content ?? "{}")
    const summary = parsed.summary?.trim() || buildFallbackSummary(transcript, sessionSummary, existingSummary)
    const name = parsed.name && parsed.name !== "null" ? parsed.name.trim() : extractNameFallback(transcript, existingName)
    return { summary, name }
  } catch (err) {
    console.error("[post-call] GPT summary failed, using fallback:", err)
    return {
      summary: buildFallbackSummary(transcript, sessionSummary, existingSummary),
      name: extractNameFallback(transcript, existingName),
    }
  }
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text()

  // Verify HMAC signature
  const valid = await verifyElevenLabsSignature(req, rawBody)
  if (!valid) {
    console.error("[post-call] ❌ Signature verification failed")
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  let envelope: Record<string, unknown>
  try {
    envelope = JSON.parse(rawBody)
  } catch {
    console.error("[post-call] ❌ Invalid JSON body")
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  // ElevenLabs sends different event types — we only care about post-call
  const eventType = envelope.type ?? envelope.event_type
  console.log(`[post-call] Received event type: ${eventType}`)

  if (eventType !== "post_call_transcription" && eventType !== "transcript") {
    console.log(`[post-call] Ignoring event type: ${eventType}`)
    return NextResponse.json({ received: true })
  }

  // Workspace-level webhooks wrap conversation data inside a `data` envelope.
  // Agent-level webhooks send data at the top level.
  // Handle both formats.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const payload = (envelope.data ?? envelope) as Record<string, any>

  const conversationId = payload.conversation_id as string | undefined
  const elevenlabsAgentId = payload.agent_id as string | undefined

  console.log(`[post-call] conversation_id=${conversationId}, agent_id=${elevenlabsAgentId}`)

  if (!conversationId || !elevenlabsAgentId) {
    console.error("[post-call] ❌ Missing conversation_id or agent_id")
    console.error("[post-call] Top-level keys:", Object.keys(envelope))
    if (envelope.data) {
      console.error("[post-call] data keys:", Object.keys(envelope.data as object))
    }
    return NextResponse.json({ error: "Missing conversation_id or agent_id" }, { status: 400 })
  }

  const metadata = payload.metadata as Record<string, unknown> | undefined
  const analysis = payload.analysis as Record<string, unknown> | undefined
  const transcript: { role: string; message: string }[] = payload.transcript ?? []

  const phoneNumber = extractPhoneNumber(payload)
  const summary = (analysis?.transcript_summary ?? payload.transcript_summary) as string | undefined
  const durationSecs = (metadata?.call_duration_secs ?? payload.call_duration_secs) as number | undefined
  const startTimeUnix = (metadata?.start_time_unix_secs ?? payload.start_time_unix_secs) as number | undefined
  const status = payload.status as string | undefined
  // Search all likely locations ElevenLabs may put cost/credits
  const rawCost =
    metadata?.cost ??
    metadata?.credits_used ??
    metadata?.credits ??
    analysis?.cost ??
    analysis?.credits_used ??
    analysis?.credits ??
    payload.credits_used ??
    payload.cost ??
    payload.credits
  const creditsUsed = typeof rawCost === "number" ? rawCost : (typeof rawCost === "string" ? parseFloat(rawCost) || 0 : 0)

  console.log(`[post-call] phone=${phoneNumber}, transcript_turns=${transcript.length}, summary=${summary ? "yes" : "no"}, creditsUsed=${creditsUsed}`)
  // Log full metadata and analysis so we can identify the correct cost field
  if (creditsUsed === 0) {
    console.log("[post-call] ⚠️ creditsUsed=0 — metadata keys:", Object.keys(metadata ?? {}))
    console.log("[post-call] ⚠️ metadata values:", JSON.stringify(metadata ?? {}))
    console.log("[post-call] ⚠️ analysis keys:", Object.keys(analysis ?? {}))
    console.log("[post-call] ⚠️ payload top-level keys:", Object.keys(payload))
  }

  // Find the matching agent in our DB by ElevenLabs agent ID
  const agent = await db.agent.findFirst({
    where: { elevenlabsAgentId },
    select: { id: true },
  })
  console.log(`[post-call] Matched DB agent: ${agent?.id ?? "none"}`)

  // Upsert customer record if we have a phone number
  let customerId: string | null = null
  if (phoneNumber) {
    const existing = await db.customer.findUnique({
      where: { phoneNumber },
      select: { id: true, name: true, conversationSummary: true },
    })

    console.log(`[post-call] Existing customer: ${existing?.id ?? "new customer"}`)

    // Build updated running summary and extract name
    const { summary: updatedSummary, name: extractedName } = await buildUpdatedSummary(
      existing?.conversationSummary ?? null,
      existing?.name ?? null,
      transcript,
      summary
    ).catch((err) => {
      console.error("[post-call] ❌ Summary generation failed:", err)
      // Always fall back to raw transcript so the customer is never forgotten
      return {
        summary: buildFallbackSummary(transcript, summary, existing?.conversationSummary ?? null),
        name: extractNameFallback(transcript, existing?.name ?? null),
      }
    })

    const customer = await db.customer.upsert({
      where: { phoneNumber },
      create: {
        phoneNumber,
        agentId: agent?.id ?? null,
        name: extractedName ?? null,
        conversationSummary: updatedSummary || null,
        lastSeen: new Date(),
      },
      update: {
        ...(extractedName ? { name: extractedName } : {}),
        conversationSummary: updatedSummary || undefined,
        lastSeen: new Date(),
      },
    })
    customerId = customer.id
    console.log(`[post-call] ✅ Customer upserted: ${customerId}`)
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
      transcript: payload.transcript ?? [],
      summary: summary ?? null,
      durationSecs: durationSecs ?? null,
      startTime: startTimeUnix ? new Date(startTimeUnix * 1000) : null,
      status: status ?? null,
      creditsUsed,
      rawPayload: payload,
    },
    update: {
      customerId,
      // Only overwrite phoneNumber if we actually have one — never blank it out
      ...(phoneNumber ? { phoneNumber } : {}),
      transcript: payload.transcript ?? [],
      summary: summary ?? null,
      durationSecs: durationSecs ?? null,
      status: status ?? null,
      ...(creditsUsed > 0 ? { creditsUsed } : {}),
      rawPayload: payload,
    },
  })

  console.log(`[post-call] ✅ ConversationLog saved for ${conversationId}`)

  return NextResponse.json({ received: true })
}
