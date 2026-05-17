import { randomUUID } from "crypto"
import type { ToolDefinition } from "../../providers/types.js"
import { sql } from "../../db/client.js"
import { logger as rootLogger } from "../../lib/logger.js"

const logger = rootLogger.child({ module: "tool:mark_qualified_lead" })

// Tool the AI calls when it has enough information to consider a customer
// a qualified lead. Creates a Lead row + (optionally) pauses the AI so a
// salesperson can close the deal personally. Coexists with the background
// AI-lead-detection scan — this is the inline path; the scan still catches
// leads the AI missed.
export const MARK_QUALIFIED_LEAD_TOOL: ToolDefinition = {
  type: "function",
  function: {
    name: "mark_qualified_lead",
    description: "Mark this conversation as a qualified lead and notify the sales team. Use ONLY when the customer has shown CLEAR buying intent AND given enough detail to act on. Specifically, you need at least TWO of:\n" +
      "- Confirmed which specific product or service they want\n" +
      "- Mentioned a quantity, budget, timeline, or location\n" +
      "- Agreed to a quoted price\n" +
      "- Asked when or how they can pay or take delivery\n" +
      "Do NOT call this for casual interest, price-shopping without commitment, or general enquiries. After calling this tool, send a single short message letting the customer know the sales team will follow up.",
    parameters: {
      type: "object",
      properties: {
        productOrService: {
          type: "string",
          description: "The specific product or service the customer wants. Use the customer's own words where possible.",
        },
        intent: {
          type: "string",
          description: "A one-sentence summary of what the customer wants and why this is a qualified lead. Include quantity, budget, or timeline if mentioned.",
        },
        budget: {
          type: "string",
          description: "Customer's stated budget if mentioned, otherwise omit.",
        },
      },
      required: ["productOrService", "intent"],
    },
  },
}

export async function executeMarkQualifiedLead(
  args: Record<string, unknown>,
  opts: { agentId: string; conversationId: string; userId: string }
): Promise<string> {
  const productOrService = typeof args.productOrService === "string" ? args.productOrService.slice(0, 200) : null
  const intent = typeof args.intent === "string" ? args.intent.slice(0, 500) : null
  const budget = typeof args.budget === "string" ? args.budget.slice(0, 100) : null

  if (!productOrService || !intent) {
    return JSON.stringify({ error: "productOrService and intent are both required" })
  }

  // Read the convo's phoneNumber + contactName for the Lead row, plus the
  // agent's pauseOnQualifiedLead setting.
  const ctxRows = await sql<{
    phoneNumber: string
    contactName: string | null
    pauseOnQualifiedLead: boolean
  }[]>`
    SELECT c."phoneNumber", c."contactName", a."pauseOnQualifiedLead"
    FROM "Conversation" c
    JOIN "Agent" a ON a."id" = c."agentId"
    WHERE c."id" = ${opts.conversationId}
    LIMIT 1
  `
  const ctx = ctxRows[0]
  if (!ctx) return JSON.stringify({ error: "Conversation not found" })
  const shouldPause = ctx.pauseOnQualifiedLead

  // Compose the Lead row's notes from the AI's structured args.
  const notesBits = [
    `Product/service: ${productOrService}`,
    `Intent: ${intent}`,
    budget ? `Budget: ${budget}` : null,
    "Source: AI inline (mark_qualified_lead tool)",
  ].filter(Boolean)
  const leadNotes = notesBits.join("\n")

  // Insert Lead. Schema requires userId for ownership; we pulled it from the
  // agent's owner via handle-inbound passthrough. Status defaults to NEW.
  const leadId = randomUUID()
  await sql`
    INSERT INTO "Lead" (
      "id", "userId", "agentId", "conversationId",
      "contactName", "phoneNumber", "notes", "status",
      "createdAt", "updatedAt"
    )
    VALUES (
      ${leadId}, ${opts.userId}, ${opts.agentId}, ${opts.conversationId},
      ${ctx.contactName}, ${ctx.phoneNumber}, ${leadNotes}, 'NEW',
      NOW(), NOW()
    )
    ON CONFLICT ("conversationId", "userId") DO UPDATE SET
      "notes" = EXCLUDED."notes",
      "updatedAt" = NOW()
  `

  // Stamp the conversation. Optionally flip mode → human.
  await sql`
    UPDATE "Conversation"
    SET "leadQualifiedAt" = NOW(),
        "leadIntent"      = ${intent}
        ${shouldPause ? sql`, "mode" = 'human'` : sql``}
    WHERE "id" = ${opts.conversationId}
  `

  logger.info(
    { conversationId: opts.conversationId, agentId: opts.agentId, paused: shouldPause, leadId },
    "Lead qualified inline by AI"
  )
  return JSON.stringify({
    success: true,
    pausedAi: shouldPause,
    message: shouldPause
      ? "Lead saved and conversation handed off to the sales team. Send a brief acknowledgement to the customer."
      : "Lead saved. You can keep replying. Send a brief acknowledgement to the customer.",
  })
}
