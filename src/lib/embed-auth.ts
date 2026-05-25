import { db } from "@/lib/db"
import { cachedJson, invalidate } from "@/lib/cache"

export interface EmbedSiteAuth {
  agentId: string
  publicKey: string
  allowedOrigins: string[]
  themeJson: unknown
  isActive: boolean
}

const embedSiteCacheKey = (publicKey: string) => `embed:site:${publicKey}`

// Look up an EmbedSite by its publicKey. Returns null when the key doesn't
// match anything OR the site is disabled — both cases map to "this widget
// is not accepting traffic," which the route layer turns into 403 without
// leaking which case it is (don't help attackers fingerprint keys).
//
// Cached (60s) because the widget hits this on EVERY init + messages poll
// (~every 2.5s per open widget) and embed config rarely changes. Negative
// results are cached too, bounded by the TTL. Call invalidateEmbedSite on any
// EmbedSite mutation so toggling active/origins takes effect promptly.
export async function resolveEmbedSite(publicKey: string): Promise<EmbedSiteAuth | null> {
  if (!publicKey || typeof publicKey !== "string") return null
  return cachedJson<EmbedSiteAuth | null>(embedSiteCacheKey(publicKey), 60, async () => {
    const site = await db.embedSite.findUnique({
      where: { publicKey },
      select: {
        agentId: true,
        publicKey: true,
        allowedOrigins: true,
        themeJson: true,
        isActive: true,
      },
    })
    if (!site || !site.isActive) return null
    return site
  })
}

// Drop the cached lookup for a publicKey after the EmbedSite is changed
// (theme, allowed origins, active toggle, regenerated key).
export async function invalidateEmbedSite(publicKey: string): Promise<void> {
  await invalidate(embedSiteCacheKey(publicKey))
}
