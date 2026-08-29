import type { ChatMessage } from "../providers/types.js"
import { isProductAlbumEnabled, listProductsForPrompt, type OrchestratorAgent } from "../db/queries/agents.js"
import type { AdContext, Message } from "../db/queries/conversations.js"
import { getRecentMessages } from "../db/queries/conversations.js"
import { retrieveRelevantChunks } from "../rag/indexer.js"
import { listMediaItems } from "../db/queries/media.js"
import { isChatTaggingEnabled, listAgentLabels } from "../db/queries/labels.js"
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

  // Whether the product-album feature is on for this agent. Computed once here
  // and reused below — it decides BOTH which "what can I show" list goes in the
  // prompt and which send tools the AI is told to use. Default to off (link /
  // single-image path) on error — never bulk-send images we can't confirm.
  let albumEnabled = false
  try {
    albumEnabled = await isProductAlbumEnabled(agent.agentId)
  } catch (err: any) {
    logger.warn({ agentId: agent.agentId, err: err?.message }, "Failed to read product-album setting — defaulting to share-link")
  }

  // Media library — product IMAGES are surfaced via the album/non-album logic
  // below; VIDEOS & DOCUMENTS are always available (a separate section) so they
  // work regardless of the catalogue-album setting.
  let mediaImages: Awaited<ReturnType<typeof listMediaItems>> = []
  let mediaDocs: Awaited<ReturnType<typeof listMediaItems>> = []
  try {
    const media = await listMediaItems(agent.agentId)
    mediaImages = media.filter((m) => m.mimeType.startsWith("image/"))
    mediaDocs = media.filter((m) => !m.mimeType.startsWith("image/"))
  } catch (err: any) {
    logger.warn({ agentId: agent.agentId, err: err.message }, "Failed to fetch media library")
  }

  if (albumEnabled) {
    // Album feature ON: the AI shows products from the catalogue (productsData),
    // sending ALL of a product's photos as an album via send_product_photos.
    try {
      const products = await listProductsForPrompt(agent.agentId)
      if (products.length > 0) {
        const list = products
          .map((p) => `- id: ${p.id} | ${p.name}${p.price ? ` (${p.price})` : ""} | ${p.photoCount} photo${p.photoCount === 1 ? "" : "s"}`)
          .join("\n")
        sections.push(`## Product catalogue\nThese are the products you can show. When a customer asks about or shows interest in a specific one, proactively send its photos with the 'send_product_photos' tool — pass the matching id below (a product with several photos is sent as one album of all its angles). Match by name/description; only send a product that is in this list.\n\n${list}`)
      }
    } catch (err: any) {
      logger.warn({ agentId: agent.agentId, err: err.message }, "Failed to fetch product catalogue")
    }
  } else if (mediaImages.length > 0) {
    // Album feature OFF: the AI sends a single product image from the media
    // library via send_media.
    const mediaList = mediaImages
      .map((m) => `- ID: ${m.id} | Description: "${m.description}"`)
      .join("\n")
    sections.push(`## Product images\nWhenever a customer asks about or shows interest in a product, proactively send its image with the 'send_media' tool (pass the item's ID) — do not wait for them to ask. Match by description. Only send an image that is in this list.\n\n${mediaList}`)
  }

  // Videos & documents — ALWAYS available regardless of the album setting. The
  // AI sends them with send_media when a customer asks for a video, brochure,
  // price list, spec sheet, etc.
  if (mediaDocs.length > 0) {
    const list = mediaDocs
      .map((m) => `- ID: ${m.id} | Type: ${m.mimeType.startsWith("video/") ? "video" : "document"} | Description: "${m.description}"`)
      .join("\n")
    sections.push(`## Videos & documents\nWhen a customer asks for a video, brochure, price list, spec sheet, or any document, send the matching item below with the 'send_media' tool (pass its ID). Match by description. Only send items in this list; if what they want isn't here, tell them it's unavailable.\n\n${list}`)
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
  // albumEnabled was computed above and decides which send tools the AI uses:
  // when off, the AI shares the catalogue link / single image instead of trying
  // to bulk-send images (which hits WhatsApp upload throttling on large albums).
  const browseAllLine = albumEnabled
    ? `- If the customer wants to browse the whole range ("let me see what you have", "show me your caps", "what do you sell"), send the full catalogue album with the send_product_catalog tool.`
    : `- If the customer wants to browse the whole range ("let me see what you have", "show me your caps", "what do you sell"): ONLY if a real product catalogue or website link is written in your business info above, share that EXACT link, character for character. If there is NO such link in your business info, do NOT send a link at all — NEVER invent, guess, shorten, or build one (in particular, never produce a "wa.me/c/..." link or any made-up URL). When you have no real link, instead name a few of your products and offer to send a photo of any specific item with the send_image tool. Either way, do NOT bulk-send images and never claim you are sending an album.`
  const specificProductLine = albumEnabled
    ? `- If the customer asks about ONE specific product (by name, type, colour, or by sending/tagging a photo), send THAT product's photos with the send_product_photos tool — pass its id from the Product catalogue list above — and confirm its price/details. Do NOT send the whole catalogue for a single-product question.`
    : `- If the customer asks about ONE specific product (by name, type, colour, or by sending/tagging a photo), send ONLY that product's image with the send_image tool and confirm its price/details — do NOT send the whole album for a single-product question.`
  sections.push(`## Product images & availability
Every product in your catalogue is available for purchase.
${browseAllLine}
${specificProductLine}
- When a customer sends a photo, or quote-replies to ("tags") a product image you sent, they're asking about that exact product — answer about it. If a tagged image shows you a product name, use that exact product.
- Only send or confirm a product that is in your catalogue. If they ask for something you don't have, tell them it's not available. Never say "not available" just because a photo is hard to identify, and never send a random/unrelated image.`)

  // Chat tagging — list the business's WhatsApp labels and how to use them, so
  // the AI can categorise the chat with the tag_conversation tool. Stage labels
  // form a funnel (one active at a time, swapped automatically); tags stack.
  try {
    if (await isChatTaggingEnabled(agent.agentId)) {
      const labels = await listAgentLabels(agent.agentId)
      if (labels.length > 0) {
        const fmt = (l: { waLabelId: string; name: string; applyRule: string | null }, kind: "stage" | "tag") =>
          `- id: ${l.waLabelId} | ${l.name} — ${l.applyRule && l.applyRule.trim()
            ? l.applyRule.trim()
            : (kind === "stage" ? "apply when the chat reaches this stage" : "apply when this describes the chat")}`
        const stages = labels.filter((l) => l.isStage)
        const tags = labels.filter((l) => !l.isStage)
        const parts: string[] = []
        if (stages.length) parts.push(`Stages (a funnel — only ONE applies at a time; tagging a new stage replaces the current one):\n${stages.map((l) => fmt(l, "stage")).join("\n")}`)
        if (tags.length) parts.push(`Tags (additive — these stack):\n${tags.map((l) => fmt(l, "tag")).join("\n")}`)
        sections.push(`## Available labels
Use the tag_conversation tool to categorise THIS chat with one of the labels below when the conversation clearly matches it. Only tag on a clear change in the customer's situation, and don't re-apply a label the chat already has.

${parts.join("\n\n")}`)
      }
    }
  } catch (err: any) {
    logger.warn({ agentId: agent.agentId, err: err?.message }, "Failed to build labels section")
  }

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

  // Per-agent overrides — when the owner has defined their own rules for WHEN a
  // chat is a qualified lead / needs a human, those take precedence over the
  // generic conditions above.
  const leadRule = agent.leadCriteria?.trim()
  const handoffRule = agent.handoffCriteria?.trim()
  if (leadRule || handoffRule) {
    const lines: string[] = [
      "## THIS business's own lead & handoff rules (these OVERRIDE the generic conditions above)",
    ]
    if (handoffRule) {
      lines.push(`\nCall **request_human_handoff** ONLY when: ${handoffRule}`)
    }
    if (leadRule) {
      lines.push(`\nCall **mark_qualified_lead** ONLY when: ${leadRule}`)
    }
    lines.push(`\nWhere these business-specific rules differ from the generic list above, FOLLOW THESE. Do not qualify a lead or hand off on weaker signals than described here.`)
    sections.push(lines.join("\n"))
  }

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

  // Formatting discipline. WhatsApp uses its OWN markup, not markdown — the most
  // common failure is the model writing **bold** (markdown) which WhatsApp shows
  // as literal "**bold**". A deterministic sanitizer in handle-inbound also
  // rewrites any markdown that slips through, but instruct the model first.
  sections.push(`## Message formatting (WhatsApp — NOT markdown)
WhatsApp has its own formatting, not markdown. Use ONLY these:
- *bold* — exactly ONE asterisk on each side. NEVER write **bold** with two asterisks; WhatsApp shows it as literal "**bold**".
- _italic_ — one underscore on each side.
- ~strikethrough~ — one tilde on each side.
- Bulleted list — start each line with "- " (a hyphen and a space).
- Numbered list — start each line with "1. ", "2. ", and so on.
- Links — write the COMPLETE plain URL on its own (e.g. https://dailzero.com/signup); plain URLs are automatically clickable.

NEVER use any of these — WhatsApp cannot render them and they appear as broken literal characters: **double asterisks**, # or ## headings, [text](url) markdown links, tables, or underline.`)

  // §7: Summaries, facts — added in later PRs
  sections.push(`## Conversation memory\nYou have access to the full conversation history with this contact shown in the messages below. You CAN and DO remember everything said in this conversation. Reference previous messages naturally when relevant. Never claim you cannot remember the conversation.`)

  // Include the weekday explicitly — gpt-4o-mini can't reliably derive the day
  // of week from a bare date, which broke "are you open now / today?" answers
  // for agents whose hours vary by day.
  const now = new Date().toLocaleString("en-US", {
    timeZone: timezone,
    weekday: "long", year: "numeric", month: "long", day: "numeric",
    hour: "numeric", minute: "2-digit",
  })
  sections.push(`## Current time\n${now} (${timezone})`)

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
