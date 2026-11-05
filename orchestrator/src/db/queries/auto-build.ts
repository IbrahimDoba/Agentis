import { sql } from "../client.js"
import type { AutoBuildChat, AutoBuildProfile } from "../../orchestrator/auto-build-draft.js"

const CHATS_TO_READ = 20
const MESSAGES_PER_CHAT = 20
const MAX_MESSAGE_CHARS = 300
// Worst case a chat has a long message on every line; this keeps a full read
// well inside what one cheap model call can take.
const MAX_CHAT_CHARS = 3_000

// Claims agents whose chats have arrived (or that have waited long enough) by
// moving them to auto_creating in one statement, so two orchestrator instances
// can never build the same agent.
export async function claimAutoBuilds(limit: number, maxWaitSeconds: number, profileGraceSeconds: number): Promise<string[]> {
  const rows = await sql<{ id: string }[]>`
    UPDATE "Agent" SET "autoConfigStatus" = 'auto_creating'
    WHERE "id" IN (
      SELECT "id" FROM "Agent"
      WHERE ("autoConfigStatus" = 'auto_ready'
              AND "autoConfigStartedAt" < NOW() - make_interval(secs => ${profileGraceSeconds}))
         OR ("autoConfigStatus" IN ('auto_profile', 'auto_chats')
              AND "autoConfigStartedAt" < NOW() - make_interval(secs => ${maxWaitSeconds}))
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING "id"
  `
  return rows.map((r) => r.id)
}

// Builds a crashed instance left behind. These are finished without the model,
// so a build that keeps killing its process can't loop forever.
export async function findAbandonedAutoBuilds(limit: number, abandonedAfterSeconds: number): Promise<string[]> {
  const rows = await sql<{ id: string }[]>`
    SELECT "id" FROM "Agent"
    WHERE "autoConfigStatus" = 'auto_creating'
      AND "autoConfigStartedAt" < NOW() - make_interval(secs => ${abandonedAfterSeconds})
    LIMIT ${limit}
  `
  return rows.map((r) => r.id)
}

export async function getAutoBuildProfile(agentId: string): Promise<AutoBuildProfile | null> {
  const rows = await sql<{
    businessName: string
    businessDescription: string | null
    category: string | null
    address: string | null
    contactEmail: string | null
    websiteLinks: string | null
  }[]>`
    SELECT "businessName", "businessDescription", "category", "address", "contactEmail", "websiteLinks"
    FROM "Agent" WHERE "id" = ${agentId} LIMIT 1
  `
  const r = rows[0]
  if (!r) return null
  return {
    businessName: r.businessName,
    description: r.businessDescription || null,
    category: r.category,
    address: r.address,
    contactEmail: r.contactEmail,
    websiteLinks: r.websiteLinks,
  }
}

// The latest chats where both sides spoke. Phone numbers and contact names are
// deliberately not selected: the draft doesn't need them, so they never leave
// our database.
export async function getRecentChatsForAutoBuild(agentId: string): Promise<AutoBuildChat[]> {
  const conversations = await sql<{ id: string }[]>`
    SELECT c."id"
    FROM "Conversation" c
    WHERE c."agentId" = ${agentId}
      AND c."channel" = 'whatsapp'
      AND c."phoneNumber" NOT LIKE '%@g.us'
      AND c."phoneNumber" NOT LIKE '%@broadcast'
      AND c."phoneNumber" NOT LIKE '%@newsletter'
      AND EXISTS (SELECT 1 FROM "Message" m WHERE m."conversationId" = c."id" AND m."direction" = 'inbound')
      AND EXISTS (SELECT 1 FROM "Message" m WHERE m."conversationId" = c."id" AND m."direction" = 'outbound')
    ORDER BY c."lastActivityAt" DESC NULLS LAST
    LIMIT ${CHATS_TO_READ}
  `
  if (conversations.length === 0) return []

  const rows = await sql<{ conversationId: string; direction: string; content: string }[]>`
    SELECT r."conversationId", r."direction", r."content"
    FROM (
      SELECT m."conversationId", m."direction", m."content", m."createdAt",
             ROW_NUMBER() OVER (PARTITION BY m."conversationId" ORDER BY m."createdAt" DESC) AS rn
      FROM "Message" m
      WHERE m."conversationId" IN ${sql(conversations.map((c) => c.id))}
        AND m."content" IS NOT NULL AND m."content" <> ''
    ) r
    WHERE r.rn <= ${MESSAGES_PER_CHAT}
    ORDER BY r."createdAt" ASC
  `

  const byChat = new Map<string, AutoBuildChat>(conversations.map((c) => [c.id, { messages: [] }]))
  for (const row of rows) {
    const chat = byChat.get(row.conversationId)
    if (!chat) continue
    const used = chat.messages.reduce((sum, m) => sum + m.text.length, 0)
    if (used >= MAX_CHAT_CHARS) continue
    chat.messages.push({ fromBusiness: row.direction === "outbound", text: row.content.slice(0, MAX_MESSAGE_CHARS) })
  }
  return [...byChat.values()].filter((c) => c.messages.length > 0)
}

export interface AutoBuildResult {
  guidelines: string
  description: string | null
  productsServices: string | null
  faqs: string | null
}

// Ends the build and switches the AI on. The status guard means only the first
// finisher writes. The prompt is only filled if still blank: an owner who typed
// their own instructions during the build keeps them, and blank-only fills on
// the other columns likewise protect anything imported or typed in.
export async function finishAutoBuild(agentId: string, result: AutoBuildResult): Promise<boolean> {
  return sql.begin(async (tx) => {
    const claimed = await tx<{ guidelinesWereBlank: boolean }[]>`
      SELECT (COALESCE(TRIM("responseGuidelines"), '') = '') AS "guidelinesWereBlank"
      FROM "Agent"
      WHERE "id" = ${agentId} AND "autoConfigStatus" = 'auto_creating'
      FOR UPDATE
    `
    if (claimed.length === 0) return false

    if (claimed[0].guidelinesWereBlank) {
      await tx`UPDATE "Agent" SET "responseGuidelines" = ${result.guidelines} WHERE "id" = ${agentId}`
      // Written together: the runtime reads OrchestratorAgent.systemPrompt while
      // the dashboard edits Agent.responseGuidelines (see agentPromptWrite.ts).
      await tx`UPDATE "OrchestratorAgent" SET "systemPrompt" = ${result.guidelines} WHERE "agentId" = ${agentId}`
    }

    await tx`
      UPDATE "Agent"
      SET "autoConfigStatus" = 'auto_done',
          "autoConfigCompletedAt" = NOW(),
          "aiRepliesEnabled" = TRUE,
          "businessDescription" = COALESCE(NULLIF("businessDescription", ''), ${result.description}, ''),
          "productsServices" = COALESCE(NULLIF("productsServices", ''), ${result.productsServices}, ''),
          "faqs" = COALESCE(NULLIF("faqs", ''), ${result.faqs}, '')
      WHERE "id" = ${agentId}
    `
    return true
  })
}
