import { describe, it, expect } from "vitest"
import { getRedis } from "@/lib/redis"
import { checkApiRateLimit } from "./apiRateLimit"
import { getIdempotentResponse, storeIdempotentResponse } from "./apiIdempotency"

// These features are Redis-backed and fail open. With Redis available we assert
// real behaviour; without it we assert the safe fallback (allow / no-replay).
const hasRedis = !!getRedis()

describe("apiRateLimit", () => {
  it("allows under the limit and blocks over it (fails open without Redis)", async () => {
    const keyId = `vitest-rl-${Date.now()}`
    const limit = 3
    const results = []
    for (let i = 0; i < limit + 2; i++) {
      results.push(await checkApiRateLimit(keyId, limit, 60))
    }

    if (hasRedis) {
      expect(results.slice(0, limit).every((r) => r.allowed)).toBe(true)
      expect(results[limit].allowed).toBe(false)
      expect(results[limit].retryAfterSec).toBeGreaterThan(0)
    } else {
      expect(results.every((r) => r.allowed)).toBe(true)
    }
  })
})

describe("apiIdempotency", () => {
  it("stores and replays a response (no-op without Redis)", async () => {
    const keyId = `vitest-idem-${Date.now()}`
    const idem = "abc-123"
    const body = { hello: "world", n: 42 }

    await storeIdempotentResponse(keyId, idem, body)
    const got = await getIdempotentResponse(keyId, idem)

    if (hasRedis) {
      expect(got).toEqual(body)
    } else {
      expect(got).toBeNull()
    }
  })
})
