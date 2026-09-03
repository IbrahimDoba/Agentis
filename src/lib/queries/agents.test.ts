import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { db } from "@/lib/db"
import { agentBelongsTo } from "./agents"

// Real DB, no mocking — same rule as the rest of the suite.
//
// Pins the scoping that closed the cross-tenant hole on
// /api/baileys/sessions/[agentId]/*, where an agentId from the URL was
// forwarded to the worker after only checking that *a* session existed.
describe("agentBelongsTo (real DB)", () => {
  const stamp = Date.now()
  let ownerId: string
  let strangerId: string
  let agentId: string

  async function seedUser(tag: string) {
    const u = await db.user.create({
      data: {
        email: `vitest-agentaccess-${tag}-${stamp}@example.test`,
        name: `vitest ${tag}`,
        businessName: "vitest co",
      },
      select: { id: true },
    })
    return u.id
  }

  beforeAll(async () => {
    ownerId = await seedUser("owner")
    strangerId = await seedUser("stranger")
    const a = await db.agent.create({
      data: {
        userId: ownerId,
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
    await db.agent.deleteMany({ where: { userId: { in: [ownerId, strangerId] } } })
    await db.user.deleteMany({ where: { id: { in: [ownerId, strangerId] } } })
  })

  it("resolves for the owning workspace", async () => {
    expect(await agentBelongsTo(db, agentId, ownerId)).toBe(true)
  })

  it("does not resolve for another user — the hole this closed", async () => {
    expect(await agentBelongsTo(db, agentId, strangerId)).toBe(false)
  })

  it("does not resolve an agentId that does not exist", async () => {
    expect(await agentBelongsTo(db, "no-such-agent-id", ownerId)).toBe(false)
  })

  it("cannot be used to probe existence: unknown and forbidden give the same answer", async () => {
    const forbidden = await agentBelongsTo(db, agentId, strangerId)
    const missing = await agentBelongsTo(db, "no-such-agent-id", strangerId)
    expect(forbidden).toBe(missing)
  })
})
