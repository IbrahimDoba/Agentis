import { db } from "@/lib/db"

export interface EmbedSiteAuth {
  agentId: string
  publicKey: string
  allowedOrigins: string[]
  themeJson: unknown
  isActive: boolean
}

// Look up an EmbedSite by its publicKey. Returns null when the key doesn't
// match anything OR the site is disabled — both cases map to "this widget
// is not accepting traffic," which the route layer turns into 403 without
// leaking which case it is (don't help attackers fingerprint keys).
export async function resolveEmbedSite(publicKey: string): Promise<EmbedSiteAuth | null> {
  if (!publicKey || typeof publicKey !== "string") return null
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
}
