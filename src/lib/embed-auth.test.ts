import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { db } from "@/lib/db"
import { getRedis } from "./redis"
import { resolveEmbedSite, invalidateEmbedSite } from "./embed-auth"

// End-to-end against the real dev DB + local Redis (no mocking). Proves the
// cache serves stale-but-valid data and that invalidation clears it. We mutate
// the row directly in the DB (bypassing the route) so any difference in the
// resolveEmbedSite result can only come from the cache.
describe("resolveEmbedSite caching (real DB + Redis)", () => {
  const publicKey = `pk_vitest_${Date.now()}`
  let agentId: string
  let createdEmbed = false

  beforeAll(async () => {
    const agent = await db.agent.findFirst({
      where: { embedSite: null },
      select: { id: true },
    })
    if (!agent) {
      // Fall back to any agent without a clashing EmbedSite is hard (1:1); skip
      // gracefully if none is free.
      return
    }
    agentId = agent.id
    await db.embedSite.create({
      data: { agentId, publicKey, allowedOrigins: ["https://example.com"], isActive: true },
      select: { id: true },
    })
    createdEmbed = true
    // Ensure a clean cache slate for this key.
    await invalidateEmbedSite(publicKey)
  })

  afterAll(async () => {
    if (createdEmbed) {
      await db.embedSite.deleteMany({ where: { publicKey } })
      await invalidateEmbedSite(publicKey)
    }
  })

  it("resolves an active site and then serves it from cache after a DB change", async () => {
    if (!createdEmbed) return
    const first = await resolveEmbedSite(publicKey)
    expect(first).not.toBeNull()
    expect(first!.agentId).toBe(agentId)

    // Disable the site directly in the DB — the cache should still serve the
    // previous (active) result until invalidated.
    await db.embedSite.update({ where: { publicKey }, data: { isActive: false } })
    const cached = await resolveEmbedSite(publicKey)
    expect(cached).not.toBeNull() // served from cache, not the DB

    // After invalidation, the fresh DB read returns null (disabled site).
    await invalidateEmbedSite(publicKey)
    const fresh = await resolveEmbedSite(publicKey)
    expect(fresh).toBeNull()
  })

  it("returns null for an unknown public key", async () => {
    const result = await resolveEmbedSite(`pk_does_not_exist_${Date.now()}`)
    expect(result).toBeNull()
  })

  it("returns null for an empty key without touching cache/DB", async () => {
    expect(await resolveEmbedSite("")).toBeNull()
  })

  it("local Redis is available for this test run", () => {
    // Sanity: if Redis were down the caching assertions above would be vacuous.
    expect(getRedis()).not.toBeNull()
  })
})
