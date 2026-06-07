import { describe, it, expect, beforeAll, afterAll } from "vitest"
import type { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { generateApiKey } from "./apiKey"
import { resolveApiCaller, requireAgentOwnership } from "./apiAuth"

// Minimal NextRequest stand-in — resolveApiCaller only reads headers.get().
function reqWithAuth(value?: string): NextRequest {
  const headers = new Headers()
  if (value !== undefined) headers.set("authorization", value)
  return { headers } as unknown as NextRequest
}

describe("apiAuth (real DB)", () => {
  let userId: string
  let otherUserId: string
  let agentId: string
  const email = `vitest-apiauth-${Date.now()}@example.test`
  const otherEmail = `vitest-apiauth-other-${Date.now()}@example.test`

  async function persistKey(scopes: string[]) {
    const gen = await generateApiKey()
    await db.apiKey.create({
      data: { userId, name: "test", prefix: gen.prefix, hashedKey: gen.hash, scopes },
    })
    return gen.raw
  }

  beforeAll(async () => {
    const u = await db.user.create({
      data: { email, name: "auth user", businessName: "co" },
      select: { id: true },
    })
    userId = u.id
    const o = await db.user.create({
      data: { email: otherEmail, name: "other", businessName: "co" },
      select: { id: true },
    })
    otherUserId = o.id
    const a = await db.agent.create({
      data: {
        userId,
        businessName: "co",
        businessDescription: "d",
        productsServices: "p",
        faqs: "f",
        operatingHours: "9-5",
      },
      select: { id: true },
    })
    agentId = a.id
  })

  afterAll(async () => {
    await db.apiKey.deleteMany({ where: { userId } })
    await db.agent.deleteMany({ where: { userId } })
    await db.user.deleteMany({ where: { id: { in: [userId, otherUserId] } } })
  })

  describe("resolveApiCaller", () => {
    it("rejects a missing Authorization header", async () => {
      const r = await resolveApiCaller(reqWithAuth(), "chat")
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.code).toBe("UNAUTHORIZED")
    })

    it("rejects a non-Bearer header", async () => {
      const r = await resolveApiCaller(reqWithAuth("Token abc"), "chat")
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.code).toBe("UNAUTHORIZED")
    })

    it("rejects an invalid key", async () => {
      const r = await resolveApiCaller(
        reqWithAuth("Bearer dz_live_nopenopenopenopenopenopenopenope"),
        "chat"
      )
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.code).toBe("UNAUTHORIZED")
    })

    it("accepts a valid key carrying the required scope", async () => {
      const raw = await persistKey(["chat"])
      const r = await resolveApiCaller(reqWithAuth(`Bearer ${raw}`), "chat")
      expect(r.ok).toBe(true)
      if (r.ok) expect(r.caller.userId).toBe(userId)
    })

    it("rejects a valid key missing the required scope", async () => {
      const raw = await persistKey(["chat"])
      const r = await resolveApiCaller(reqWithAuth(`Bearer ${raw}`), "manage")
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.code).toBe("FORBIDDEN_SCOPE")
    })
  })

  describe("requireAgentOwnership", () => {
    it("allows the owner", async () => {
      expect(await requireAgentOwnership(userId, agentId)).toBeNull()
    })

    it("blocks a non-owner with AGENT_NOT_FOUND", async () => {
      expect(await requireAgentOwnership(otherUserId, agentId)).toBe("AGENT_NOT_FOUND")
    })

    it("blocks an unknown agent with AGENT_NOT_FOUND", async () => {
      expect(await requireAgentOwnership(userId, "does-not-exist")).toBe("AGENT_NOT_FOUND")
    })
  })
})
