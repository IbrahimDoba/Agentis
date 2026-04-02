import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"

// Normalize any phone-like string to just digits
function normalizePhone(raw: string): string | null {
  const jidMatch = raw.match(/^(\d+)[:@]/)
  const cleaned = jidMatch ? jidMatch[1] : raw.replace(/\D/g, "")
  return cleaned.length >= 7 ? cleaned : null
}

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

  // 4. Top-level fallbacks
  const topLevel = [payload.caller_id as string, payload.from_number as string]
  for (const c of topLevel) {
    if (c) {
      const normalized = normalizePhone(c)
      if (normalized) return normalized
    }
  }

  return null
}

// ElevenLabs calls this before a conversation starts.
// We return dynamic_variables that get injected into the agent's prompt.
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

  const phoneNumber = extractPhoneNumber(payload)

  // New customer — no phone number found
  if (!phoneNumber) {
    return NextResponse.json({
      type: "conversation_initiation_client_data",
      dynamic_variables: {
        customer_context: "This is a new customer. Greet them warmly. If their name comes up naturally in conversation, remember it.",
      },
    })
  }

  const customer = await db.customer.findUnique({
    where: { phoneNumber },
    select: { name: true, conversationSummary: true },
  })

  // First time caller — no prior conversations logged yet
  if (!customer || !customer.conversationSummary) {
    return NextResponse.json({
      type: "conversation_initiation_client_data",
      dynamic_variables: {
        customer_context: "This is a new customer. Greet them warmly. If their name comes up naturally in conversation, remember it.",
      },
    })
  }

  // Returning customer — inject memory
  const name = customer.name ? customer.name : "the customer"
  const customerContext = `You are speaking with ${name}. Here is context from their previous conversations:\n${customer.conversationSummary}\n\nGreet them warmly by name and acknowledge they are a returning customer. Reference relevant past interactions naturally where appropriate.`

  return NextResponse.json({
    type: "conversation_initiation_client_data",
    dynamic_variables: {
      customer_context: customerContext,
    },
  })
}
