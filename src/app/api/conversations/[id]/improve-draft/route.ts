import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import OpenAI from "openai"
import { getConversationMessages } from "@/lib/queries/messages"
import { getAgentBillingContext, preflightApiCharge } from "@/lib/apiBilling"
import { chargeDraftAssist, DRAFT_ASSIST_CREDITS } from "@/lib/draftAssist"

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

// POST /api/conversations/:id/improve-draft
// Takes the operator's WhatsApp draft, polishes it (fix errors, improve
// clarity, keep their voice) using recent conversation context, and returns
// the improved text for the operator to review before sending. Charges a flat
// DRAFT_ASSIST_CREDITS. Does NOT send anything.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth()
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { id: conversationId } = await params
    const { text } = await req.json()
    if (!text?.trim()) return NextResponse.json({ error: "text is required" }, { status: 400 })

    // Verify ownership via conversation → agent → user
    const conversation = await db.conversation.findUnique({
      where: { id: conversationId },
      select: { agentId: true, agent: { select: { userId: true } } },
    })
    if (!conversation) return NextResponse.json({ error: "Not found" }, { status: 404 })
    if (conversation.agent.userId !== session.user.id && session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    // Pre-flight credit check — same gate as AI sends. Don't do (paid) LLM work
    // for an account that definitively can't cover the charge.
    const ctx = await getAgentBillingContext(conversation.agentId)
    if (!ctx) return NextResponse.json({ error: "Agent not found" }, { status: 404 })
    const pre = await preflightApiCharge(ctx)
    if (!pre.ok) {
      const message =
        pre.reason === "SUBSCRIPTION_EXPIRED"
          ? "Subscription expired."
          : "Not enough credits to use AI polish."
      return NextResponse.json({ error: message, code: pre.reason }, { status: 402 })
    }

    // Recent conversation for context (so the AI fixes references correctly).
    const page = await getConversationMessages(db, conversationId, { limit: 10 })
    const transcript = page.messages
      .filter((m) => m.content?.trim())
      .map((m) => `${m.direction === "inbound" ? "Customer" : "You"}: ${m.content}`)
      .join("\n")

    const systemPrompt =
      "You are a writing assistant for a business operator replying to a customer on WhatsApp. " +
      "You polish the operator's DRAFT so it's ready to send."

    const userPrompt = `Improve the DRAFT below.

Rules:
- Keep the operator's original meaning, intent and voice. Do NOT add new facts, prices, promises, or commitments they didn't write.
- Fix spelling, grammar and punctuation; make it clear, natural and professional.
- Keep it concise — like a real person texting on WhatsApp, not a formal email.
- Reply in the SAME language the draft is written in.
- Do NOT add greetings or sign-offs unless they were already in the draft.
- Return ONLY the polished message text — no quotes, labels, or explanations.
${transcript ? `\nRECENT CONVERSATION (context only — do not reply to it):\n${transcript}\n` : ""}
DRAFT TO POLISH:
${text.trim()}`

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      max_tokens: 400,
      temperature: 0.4,
    })

    const improved = completion.choices[0]?.message?.content?.trim() ?? ""
    if (!improved) {
      return NextResponse.json({ error: "Failed to generate improved text" }, { status: 502 })
    }

    // Charge only after a successful generation.
    await chargeDraftAssist({
      agentId: conversation.agentId,
      conversationId,
      ctx,
      tokensInput: completion.usage?.prompt_tokens ?? 0,
      tokensOutput: completion.usage?.completion_tokens ?? 0,
    })

    return NextResponse.json({ text: improved, creditsUsed: DRAFT_ASSIST_CREDITS })
  } catch (err) {
    console.error("[POST /api/conversations/:id/improve-draft]", err)
    return NextResponse.json({ error: "Failed to improve draft" }, { status: 500 })
  }
}
