import { db } from "@/lib/db"
import { cachedJson } from "@/lib/cache"

// The three totals the marketing hero ticks.
//
// Platform-wide on purpose, and not scoped by resellerId: a reseller domain
// never renders the landing page at all (src/app/(marketing)/page.tsx redirects
// it to /signup), so the only caller is dailzero.com asking "how much has this
// product actually done". Scoping to the platform reseller would undercount,
// because reseller traffic is still work the product did.

export type PublicStats = {
  aiMessages: number
  leads: number
  conversations: number
}

const CACHE_KEY = "public:stats:v1"

// Short enough that the hero visibly moves between visits, long enough that a
// traffic burst cannot turn three unindexed COUNT(*)s into the slowest query on
// the landing page.
const TTL_SECONDS = 60

// Second line of defence for the no-Redis case (REDIS_URL unset, or Redis
// unreachable). cachedJson degrades to calling the loader every time, which on
// a public page means one full count per visitor. This bounds that per process.
let memo: { at: number; value: PublicStats } | null = null

/**
 * Null on failure rather than throwing. These counters sit on a marketing page:
 * a database hiccup must not 500 the homepage, and rendering zeros would read
 * worse than rendering nothing. A stale-but-real memo value beats null when one
 * is available.
 */
export async function getPublicStats(): Promise<PublicStats | null> {
  if (memo && Date.now() - memo.at < TTL_SECONDS * 1000) return memo.value
  try {
    const value = await cachedJson(CACHE_KEY, TTL_SECONDS, countPublicStats)
    memo = { at: Date.now(), value }
    return value
  } catch (error) {
    console.error("[public-stats] count failed:", error)
    return memo?.value ?? null
  }
}

async function countPublicStats(): Promise<PublicStats> {
  const [aiMessages, leads, conversations] = await Promise.all([
    // senderRole is what separates the agent's replies from an owner typing in
    // the dashboard, so this counts messages the AI sent, not outbound traffic.
    db.message.count({ where: { direction: "outbound", senderRole: "ai" } }),
    db.lead.count(),
    // Deliberately unfiltered by deletedAt. On Conversation a soft delete is a
    // per-conversation AI memory reset, not a retraction — that conversation
    // was still handled, so a lifetime total should keep counting it.
    db.conversation.count(),
  ])
  return { aiMessages, leads, conversations }
}
