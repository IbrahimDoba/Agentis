import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"

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

  // ElevenLabs sends the caller's phone number in different fields depending on the channel
  const phoneNumber =
    (payload.caller_id as string) ||
    (payload.from_number as string) ||
    ((payload.metadata as Record<string, unknown>)?.from_number as string) ||
    null

  if (!phoneNumber) {
    // New customer — no memory to inject, return empty variables
    return NextResponse.json({
      type: "conversation_initiation_client_data",
      dynamic_variables: {
        customer_name: "",
        customer_memory: "",
        is_returning_customer: "false",
      },
    })
  }

  const customer = await db.customer.findUnique({
    where: { phoneNumber },
    select: { name: true, conversationSummary: true },
  })

  if (!customer || !customer.conversationSummary) {
    // First time caller
    return NextResponse.json({
      type: "conversation_initiation_client_data",
      dynamic_variables: {
        customer_name: customer?.name ?? "",
        customer_memory: "",
        is_returning_customer: "false",
      },
    })
  }

  return NextResponse.json({
    type: "conversation_initiation_client_data",
    dynamic_variables: {
      customer_name: customer.name ?? "",
      customer_memory: customer.conversationSummary,
      is_returning_customer: "true",
    },
  })
}
