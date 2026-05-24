import type { PrismaClient } from "@/generated/prisma/client"

// Windowed message reads for the dashboard conversation drawer. Previously the
// endpoint loaded a conversation's ENTIRE history on every 30s poll; this caps
// each read to the newest N and exposes a cursor for loading older pages.

export const DEFAULT_MESSAGE_LIMIT = 50
export const MAX_MESSAGE_LIMIT = 100

export interface MessageRow {
  id: string
  direction: string
  content: string
  mediaUrl: string | null
  createdAt: Date
}

export interface MessagePage {
  messages: MessageRow[] // chronological: oldest → newest
  hasMore: boolean // true if older messages exist before this window
  nextCursor: string | null // pass as `before` to fetch the previous (older) page
}

function clampLimit(limit: number | undefined): number {
  if (!limit || Number.isNaN(limit)) return DEFAULT_MESSAGE_LIMIT
  return Math.min(Math.max(Math.floor(limit), 1), MAX_MESSAGE_LIMIT)
}

/**
 * Fetch the newest `limit` messages for a conversation (or the page older than
 * `before`). Returns them in chronological order for direct rendering, plus a
 * cursor + hasMore flag for "load earlier".
 *
 * Pagination is id-cursor based on a createdAt-desc ordering: we fetch
 * `limit + 1` rows to detect whether an older page exists without a second
 * count query.
 */
export async function getConversationMessages(
  db: Pick<PrismaClient, "message">,
  conversationId: string,
  opts: { limit?: number; before?: string } = {}
): Promise<MessagePage> {
  const limit = clampLimit(opts.limit)

  const rows = await db.message.findMany({
    where: { conversationId },
    orderBy: { createdAt: "desc" },
    take: limit + 1,
    ...(opts.before ? { cursor: { id: opts.before }, skip: 1 } : {}),
    select: {
      id: true,
      direction: true,
      content: true,
      mediaUrl: true,
      createdAt: true,
    },
  })

  const hasMore = rows.length > limit
  const page = hasMore ? rows.slice(0, limit) : rows
  // `page` is newest → oldest; its last element is the oldest in this window
  // and becomes the cursor for the next (older) page.
  const nextCursor = hasMore ? page[page.length - 1].id : null
  page.reverse() // chronological for display

  return { messages: page, hasMore, nextCursor }
}
