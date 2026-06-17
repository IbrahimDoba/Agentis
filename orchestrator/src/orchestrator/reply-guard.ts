import OpenAI from "openai"
import { config } from "../config.js"
import { logger as rootLogger } from "../lib/logger.js"
import type { ChatMessage } from "../providers/types.js"

const logger = rootLogger.child({ module: "reply-guard" })

const GUARD_MODEL = "gpt-4o-mini"
const HISTORY_WINDOW = 10

const SYSTEM_PROMPT = `You are the overseer of a WhatsApp AI customer service agent. Before every reply goes out, you make sure it is the RIGHT thing to say. You NEVER block a reply, and you NEVER hand off or escalate to a human — the customer always gets a reply from you. Your only job is to return the best version of the message to send.

Analyse the recent conversation and the AI's proposed reply, then return a JSON decision — no other text.

SEND the proposed reply UNCHANGED when it is already natural, correct, and adds value. This is the default — keep the AI's own wording unless there is a clear reason to change it.

SEND an IMPROVED (rewritten) message when the reply is on the right track but the wording is off. Always write a better, SHORT reply — never empty:
- The customer is just acknowledging or winding down ("ok", "thanks", "great", "got it", "sure", "cool", "noted", "👍", "🙏") → reply with a brief, warm acknowledgment that fits ("Anytime! 😊", "Glad I could help — just shout if you need anything else!"). NEVER leave them on silence, and do NOT over-explain.
- The reply repeats information already given in the last 1–2 turns → replace it with a short, fresh line that moves the conversation forward instead of restating.
- The reply is too long, rambling, or robotic → tighten it.
- The tone is off (too upbeat while the customer is upset) → acknowledge the feeling first.

A routine question — including a customer asking the price or details of a product they sent or tagged in a photo — is NOT a reason to change much; let the AI's answer through. Do NOT try to escalate, hand off, or flag for a human: that is handled separately by the main agent. Your output is ALWAYS a message to send to the customer.

Return ONLY valid JSON. No explanation, no markdown, no labels.
{"message":"<the reply text to send>"}`

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

// Parse the guard's JSON and return the message to send. Falls open to the
// original reply on any malformed/empty output — the guard must never drop a
// legitimate reply.
function parseGuardedMessage(raw: string, fallback: string): string {
  try {
    // Strip any accidental markdown fences the model might emit
    const cleaned = raw.replace(/^```[a-z]*\n?/i, "").replace(/\n?```$/i, "").trim()
    const parsed = JSON.parse(cleaned)
    if (typeof parsed.message === "string" && parsed.message.trim()) {
      return parsed.message.trim()
    }
  } catch {
    // Fall through to fail-open
  }

  logger.warn({ raw }, "Reply guard returned unparseable output — passing through original reply")
  return fallback
}

// Review the proposed reply and return the message to actually send — either the
// AI's reply unchanged, or a tightened/rewritten version. Never suppresses and
// never hands off (handoffs are owned by the main agent's request_human_handoff
// tool, which has the full context including any image the customer sent).
export async function guardReply(
  history: ChatMessage[],
  proposedReply: string
): Promise<string> {
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
    const message = parseGuardedMessage(raw, proposedReply)

    if (message !== proposedReply) {
      logger.info(
        { originalLength: proposedReply.length, rewrittenLength: message.length },
        "Reply guard: rewrote reply"
      )
    }

    return message
  } catch (err) {
    // Fail-open: a guard error must never silence a legitimate reply
    logger.warn({ err }, "Reply guard failed — passing through original reply")
    return proposedReply
  }
}
