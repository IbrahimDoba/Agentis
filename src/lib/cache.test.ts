import { describe, it, expect, beforeEach, afterAll, vi } from "vitest"
import { cachedJson, invalidate } from "./cache"
import { getRedis } from "./redis"

// Runs against the local Redis (REDIS_URL from .env.local). Uses a unique key
// prefix per run so it never collides with real data, and cleans up after.
const PREFIX = `vitest:cache:${Date.now()}:`
const k = (name: string) => `${PREFIX}${name}`

describe("cachedJson (real Redis)", () => {
  beforeEach(async () => {
    const redis = getRedis()
    if (redis) {
      const keys = await redis.keys(`${PREFIX}*`)
      if (keys.length) await redis.del(...keys)
    }
  })

  afterAll(async () => {
    const redis = getRedis()
    if (redis) {
      const keys = await redis.keys(`${PREFIX}*`)
      if (keys.length) await redis.del(...keys)
    }
  })

  it("runs the loader on a miss and caches the result", async () => {
    const loader = vi.fn(async () => ({ value: 42 }))
    const first = await cachedJson(k("a"), 60, loader)
    expect(first).toEqual({ value: 42 })
    expect(loader).toHaveBeenCalledTimes(1)
  })

  it("returns the cached value on a hit without re-running the loader", async () => {
    const loader = vi.fn(async () => ({ value: 7 }))
    await cachedJson(k("b"), 60, loader)
    const second = await cachedJson(k("b"), 60, loader)
    expect(second).toEqual({ value: 7 })
    expect(loader).toHaveBeenCalledTimes(1) // not called the second time
  })

  it("caches null results (negative caching) distinctly from a miss", async () => {
    const loader = vi.fn(async () => null)
    const first = await cachedJson<null>(k("c"), 60, loader)
    const second = await cachedJson<null>(k("c"), 60, loader)
    expect(first).toBeNull()
    expect(second).toBeNull()
    expect(loader).toHaveBeenCalledTimes(1) // null was cached, not re-loaded
  })

  it("invalidate() forces the next call to re-run the loader", async () => {
    const loader = vi.fn(async () => ({ n: Math.random() }))
    await cachedJson(k("d"), 60, loader)
    await invalidate(k("d"))
    await cachedJson(k("d"), 60, loader)
    expect(loader).toHaveBeenCalledTimes(2)
  })

  it("expires entries after the TTL", async () => {
    const loader = vi.fn(async () => ({ v: 1 }))
    await cachedJson(k("e"), 1, loader) // 1s TTL
    await new Promise((r) => setTimeout(r, 1300))
    await cachedJson(k("e"), 1, loader)
    expect(loader).toHaveBeenCalledTimes(2)
  })

  it("preserves nested object/array shape through the round trip", async () => {
    const payload = { items: [{ id: "x", tags: ["a", "b"] }], total: 2 }
    await cachedJson(k("f"), 60, async () => payload)
    const cached = await cachedJson(k("f"), 60, async () => ({}) as typeof payload)
    expect(cached).toEqual(payload)
  })
})
