import { describe, it, expect, beforeEach, vi } from "vitest"
import { cachedTtl, invalidateTtl, invalidateTtlPrefix, __resetTtlCacheForTests } from "./ttl-cache.js"

describe("cachedTtl", () => {
  beforeEach(() => {
    __resetTtlCacheForTests()
  })

  it("runs the loader on the first call and caches the result", async () => {
    const loader = vi.fn(async () => ({ v: 1 }))
    const a = await cachedTtl("k", 60_000, loader)
    const b = await cachedTtl("k", 60_000, loader)
    expect(a).toEqual({ v: 1 })
    expect(b).toEqual({ v: 1 })
    expect(loader).toHaveBeenCalledTimes(1)
  })

  it("re-runs the loader after the entry expires", async () => {
    const loader = vi.fn(async () => Math.random())
    await cachedTtl("k", 10, loader)
    await new Promise((r) => setTimeout(r, 20))
    await cachedTtl("k", 10, loader)
    expect(loader).toHaveBeenCalledTimes(2)
  })

  it("caches negative (null/undefined) results", async () => {
    const loader = vi.fn(async () => null)
    await cachedTtl("k", 60_000, loader)
    await cachedTtl("k", 60_000, loader)
    expect(loader).toHaveBeenCalledTimes(1)
  })

  it("invalidateTtl forces the next call to re-run the loader", async () => {
    const loader = vi.fn(async () => 1)
    await cachedTtl("k", 60_000, loader)
    invalidateTtl("k")
    await cachedTtl("k", 60_000, loader)
    expect(loader).toHaveBeenCalledTimes(2)
  })

  it("invalidateTtlPrefix drops every key with the given prefix", async () => {
    const loader = vi.fn(async () => 1)
    await cachedTtl("agent:a", 60_000, loader)
    await cachedTtl("agent:b", 60_000, loader)
    await cachedTtl("other:c", 60_000, loader)
    invalidateTtlPrefix("agent:")
    await cachedTtl("agent:a", 60_000, loader)
    await cachedTtl("agent:b", 60_000, loader)
    await cachedTtl("other:c", 60_000, loader)
    expect(loader).toHaveBeenCalledTimes(5) // 3 initial + 2 reloads (agent:a, agent:b)
  })
})
