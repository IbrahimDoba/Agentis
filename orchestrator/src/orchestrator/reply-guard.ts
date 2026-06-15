import OpenAI from "openai"
import { config } from "../config.js"
import { logger as rootLogger } from "../lib/logger.js"
import type { ChatMessage } from "../providers/types.js"

const logger = rootLogger.child({ module: "reply-guard" })

const GUARD_MODEL = "gpt-4o-mini"
const HISTORY_WINDOW = 10

const SYSTEM_PROMPT = `You are a quality controller for a WhatsApp AI customer service agent. Before every reply goes out, you decide whether to send it, rewrite it, suppress it, or hand off to a human.

Analyse the recent conversation and the AI's proposed reply. Return a JSON decision — no other text.

SUPPRESS when:
- Customer is closing the conversation ("okay", "thanks", "bye", "alright", "got it", "sure", "ok cool", "noted", "👍", "🙏", or any short social signal)
- The proposed reply is a pure repeat of information already sent 1–2 turns ago (same product list, same prices, same answer)
- The reply is low-value filler ("Is there anything else I can help you with?" when the conversation is clearly winding down)
- Customer sent only an emoji, sticker, or reaction with no real question

HANDOFF when:
- Customer explicitly asks for a human ("can I speak to someone?", "I need a real person", "let me talk to your team")
- Customer is clearly frustrated — repeating the same complaint, saying "you're not helping", "this is useless", "I already told you"
- The AI has given the same answer 2+ times and the customer is still unsatisfied (stuck loop)
- The issue involves a complaint, refund, dispute, or requires real human judgment
- Set urgency "high" when customer is visibly angry or threatening
- Write a short, warm handoff message for the customer (e.g. "Let me get one of our team members on this for you right away!")

SEND unchanged when the reply is genuinely new and helpful.

REWRITE when the reply is on the right track but:
- Too long, or restates info from the previous 1–2 AI messages
- Answers a question the customer already received — shorten it to a brief natural follow-up
- Tone is off (too cheery when customer is upset) — acknowledge the feeling first

Return ONLY valid JSON. No explanation, no markdown, no labels.
- Suppress:  {"action":"suppress"}
- Handoff:   {"action":"handoff","reason":"<why — operators read this>","urgency":"normal"|"high","message":"<what to send customer>"}
- Send:      {"action":"send","message":"<reply text>"}`

export type GuardDecision =
  | { action: "send"; message: string }
  | { action: "suppress" }
  | { action: "handoff"; reason: string; urgency: "normal" | "high"; message: string }

function formatHistory(messages: ChatMessage[]): string {
  return messages
    .slice(-HISTORY_WINDOW)
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => {
      if (m.role === "user") {
        const text = typeof m.content === "string" ? m.content : "[Image/media]"
        return `Customer: ${text}`
      }
      // Assistant — note any tools it used so the guard knows what was already sent
      const toolNotes = (m.tool_calls ?? [])
        .map((tc) => {
          if (tc.name === "send_product_catalog") return "[Sent product catalog]"
          if (tc.name === "send_image") return "[Sent image]"
          if (tc.name === "request_human_handoff") return "[Requested human handoff]"
          return `[Used tool: ${tc.name}]`
        })
        .join(" ")
      const text = typeof m.content === "string" ? m.content.trim() : ""
      return `AI: ${[toolNotes, text].filter(Boolean).join(" ")}`
    })
    .join("\n")
}

function parseDecision(raw: string, fallback: string): GuardDecision {
  try {
    // Strip any accidental markdown fences the model might emit
    const cleaned = raw.replace(/^```[a-z]*\n?/i, "").replace(/\n?```$/i, "").trim()
    const parsed = JSON.parse(cleaned)

    if (parsed.action === "suppress") return { action: "suppress" }

    if (parsed.action === "handoff") {
      const reason = typeof parsed.reason === "string" ? parsed.reason : "Guard-detected handoff signal"
      const urgency = parsed.urgency === "high" ? "high" : "normal"
      const message = typeof parsed.message === "string" ? parsed.message : "Let me get someone from our team to help you right away!"
      return { action: "handoff", reason, urgency, message }
    }

    if (parsed.action === "send" && typeof parsed.message === "string" && parsed.message.trim()) {
      return { action: "send", message: parsed.message.trim() }
    }
  } catch {
    // Fall through to fail-open
  }

  logger.warn({ raw }, "Reply guard returned unparseable output — passing through original reply")
  return { action: "send", message: fallback }
}

export async function guardReply(
  history: ChatMessage[],
  proposedReply: string
): Promise<GuardDecision> {
  const formattedHistory = formatHistory(history)
  const userContent = `Recent conversation:\n${formattedHistory || "(no prior history)"}\n\nAI's proposed reply:\n${proposedReply}`

  try {
    const client = new OpenAI({ apiKey: config.OPENAI_API_KEY })
    const response = await client.chat.completions.create({
      model: GUARD_MODEL,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userContent },
      ],
      temperature: 0.1,
      max_tokens: 400,
    })

    const raw = response.choices[0]?.message?.content ?? ""
    const decision = parseDecision(raw, proposedReply)

    if (decision.action === "suppress") {
      logger.info("Reply guard: suppressed reply")
    } else if (decision.action === "handoff") {
      logger.info({ reason: decision.reason, urgency: decision.urgency }, "Reply guard: triggered handoff")
    } else if (decision.message !== proposedReply) {
      logger.info(
        { originalLength: proposedReply.length, rewrittenLength: decision.message.length },
        "Reply guard: rewrote reply"
      )
    }

    return decision
  } catch (err) {
    // Fail-open: a guard error must never silence a legitimate reply
    logger.warn({ err }, "Reply guard failed — passing through original reply")
    return { action: "send", message: proposedReply }
  }
}
