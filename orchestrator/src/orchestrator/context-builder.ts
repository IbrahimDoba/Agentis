import type { ChatMessage } from "../providers/types.js"
import type { OrchestratorAgent } from "../db/queries/agents.js"
import type { AdContext, Message } from "../db/queries/conversations.js"
import { getRecentMessages } from "../db/queries/conversations.js"
import { retrieveRelevantChunks } from "../rag/indexer.js"
import { listMediaItems } from "../db/queries/media.js"
import { logger as rootLogger } from "../lib/logger.js"

const logger = rootLogger.child({ module: "context-builder" })

/**
 * Build the system prompt from agent config + RAG chunks + Media library.
 * Also injects personality, memory reminder, and current time.
 */
export async function buildSystemPrompt(
  agent: OrchestratorAgent,
  timezone: string,
  queryText?: string,
  adContext?: AdContext | null
): Promise<string> {
  const sections: string[] = []

  sections.push(agent.systemPrompt)

  if (agent.personality) {
    sections.push(`## Personality\n${agent.personality}`)
  }

  // CTWA ad referral context — only present during the opening exchanges
  // of a conversation that started with a click on a WhatsApp ad. Gated
  // upstream by handle-inbound (message count window), so this section
  // disappears naturally once the conversation moves past the greeting.
  if (adContext && (adContext.title || adContext.body)) {
    const lines: string[] = []
    if (adContext.title) lines.push(`Ad headline: "${adContext.title}"`)
    if (adContext.body) lines.push(`Ad description: "${adContext.body}"`)
    sections.push(`## How this customer arrived
This customer just clicked your WhatsApp ad and started this conversation.

${lines.join("\n")}

Greet them with awareness of what brought them here. Do NOT ask a generic "how can I help" — they came for a specific thing. Reference the product or offer from the ad and move them toward the next step (confirming price, sending an image, taking an order, booking, etc.). After the first few messages, treat the conversation normally and stop bringing up the ad explicitly.`)
  }

  // Media Library: tell the AI what images are available to send
  try {
    const media = await listMediaItems(agent.agentId)
    if (media.length > 0) {
      const mediaList = media
        .map((m) => `- ID: ${m.id} | Description: "${m.description}"`)
        .join("\n")
      sections.push(`## Available media\nYou have access to the following product images. Whenever a customer asks about or shows interest in a product, proactively send its image using the 'send_image' tool — do not wait for them to ask for a picture. Match by product name or description.\n\n${mediaList}`)
    }
  } catch (err: any) {
    logger.warn({ agentId: agent.agentId, err: err.message }, "Failed to fetch media library")
  }

  // RAG: inject top-5 relevant chunks from the document knowledge base
  if (queryText) {
    try {
      const chunks = await retrieveRelevantChunks(agent.agentId, queryText, 5)
      if (chunks.length > 0) {
        const ragSection = chunks
          .map((c) => `[From: ${c.filename}]\n${c.content}`)
          .join("\n\n")
        sections.push(`## Knowledge base\nRelevant information from uploaded documents:\n\n${ragSection}`)
        logger.debug({ agentId: agent.agentId, chunkCount: chunks.length }, "RAG chunks injected")
      }
    } catch (err: any) {
      // RAG failure should never break the response — degrade gracefully
      logger.warn({ agentId: agent.agentId, err: err.message }, "RAG retrieval failed — continuing without it")
    }
  }

  // Images & availability — route browse-all vs specific-product correctly, and
  // keep the AI from wrongly saying "not available" on a hard-to-recognise photo.
  sections.push(`## Product images & availability
Every product in your catalogue is available for purchase.
- If the customer wants to browse the whole range ("let me see what you have", "show me your caps", "what do you sell"), send the full catalogue album with the send_product_catalog tool.
- If the customer asks about ONE specific product (by name, type, colour, or by sending/tagging a photo), send ONLY that product's image with the send_image tool and confirm its price/details — do NOT send the whole album for a single-product question.
- When a customer sends a photo, or quote-replies to ("tags") a product image you sent, they're asking about that exact product — answer about it. If a tagged image shows you a product name, use that exact product.
- Only send or confirm a product that is in your catalogue. If they ask for something you don't have, tell them it's not available. Never say "not available" just because a photo is hard to identify, and never send a random/unrelated image.`)

  // Platform-level handoff + lead-qualification discipline. Two specific
  // tools we want the AI to use proactively but not over-eagerly.
  sections.push(`## When to hand off or qualify a lead (mandatory)

Two tools are available for situations the AI shouldn't handle alone:

1. **request_human_handoff** — call this AND pause yourself when:
   - The customer asks to speak to a human, manager, or real person
   - The customer is frustrated, complaining, or repeating the same question more than twice
   - The question is sensitive: refunds, returns, complaints, legal, partnerships, custom quotes the business hasn't priced
   - You genuinely don't have the information to answer (don't bluff — hand off)
   Then send a single short message: "Let me get a human to help with this. Someone will be with you shortly."

2. **mark_qualified_lead** — call this when the customer has shown clear buying intent AND given enough detail to act on. Requires at least TWO of: confirmed product/service, quantity/budget/timeline/location mentioned, agreed price, asked how/when to pay. Then send: "Great! Let me connect you with our sales team to finalize the details."

Do NOT use either tool for routine questions you can answer from your system prompt or knowledge base. Try answering first. Only escalate when one of the above conditions is actually met.`)

  // Platform-level tool-use discipline. Applies to every agent, every call.
  // This addresses gpt-4o-mini's tendency to (1) quote stale prices/data
  // from earlier in the conversation instead of re-calling tools, (2) invent
  // references/account numbers that look plausible but aren't real, and
  // (3) re-trigger action tools (create_payment, place_order) when a status
  // check fails — generating duplicates that fragment the conversation.
  sections.push(`## Tool use discipline (mandatory — overrides anything below)

When tools or knowledge base sections are available in this conversation, they are the source of truth for current state. Never rely on conversation memory for data that may have changed.

1. Prices, availability, payment details, status: re-call the relevant tool every time the customer asks — do not quote earlier values from memory.
2. Action tools (create_payment, place_order, book_appointment, send_image, etc.): call ONCE per intent per conversation. If a follow-up check fails, retry the CHECK with the SAME reference — do not create a new action.
3. Status tools (check_payment_status, check_order_status, etc.): always re-call to get fresh state. Use the EXACT reference returned by the original action — do not invent, alter, paraphrase, or substitute it (e.g. don't pass an account number when the tool expects a transaction reference).
4. NEVER invent: account numbers, references, transaction IDs, confirmation codes, prices, stock levels, policies, shipping dates, or any data that should come from a tool.
5. If a tool returns an error, empty result, or unexpected data, tell the customer truthfully — do not fabricate a recovery.`)

  // Formatting discipline. WhatsApp (and most chat channels) auto-link plain
  // URLs but do NOT render markdown links — [text](url) shows up as broken,
  // unclickable text. This is the #1 cause of "the link doesn't work".
  sections.push(`## Message formatting
You are chatting on WhatsApp. When you share a link, write the COMPLETE plain URL on its own (e.g. https://dailzero.com/signup). NEVER use markdown link formatting like [text](url), and never wrap a URL in brackets or parentheses — plain URLs are automatically clickable, markdown links are not and will appear broken to the customer. For emphasis use only WhatsApp styles: *bold*, _italic_. Do not use markdown headings (#) or tables.`)

  // §7: Summaries, facts — added in later PRs
  sections.push(`## Conversation memory\nYou have access to the full conversation history with this contact shown in the messages below. You CAN and DO remember everything said in this conversation. Reference previous messages naturally when relevant. Never claim you cannot remember the conversation.`)

  const now = new Date().toLocaleString("en-US", { timeZone: timezone })
  sections.push(`## Current time\n${now}`)

  return sections.join("\n\n")
}

/**
 * Build the messages array for the LLM from conversation history.
 * The current inbound message must already be inserted in DB before calling this.
 * getRecentMessages will include it as the last entry.
 */
export async function buildMessages(
  conversationId: string,
  shortTermWindow: number
): Promise<ChatMessage[]> {
  const recent = await getRecentMessages(conversationId, shortTermWindow)
  return recent.map((m) => mapMessage(m))
}

function mapMessage(m: Message): ChatMessage {
  let content: string = m.content ?? ""

  // Prepend image description if present
  if (m.mediaDescription) {
    content = `[Customer sent an image: ${m.mediaDescription}]\n\n${content}`
  }

  return {
    role: m.direction === "inbound" ? "user" : "assistant",
    content,
  }
}
