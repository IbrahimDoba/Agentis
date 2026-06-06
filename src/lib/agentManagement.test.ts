import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { db } from "@/lib/db"
import {
  listAgentsForUser,
  getAgentForUser,
  getAgentToolsForUser,
  setAgentToolsForUser,
} from "./agentManagement"

describe("agentManagement (real DB)", () => {
  let userId: string
  let otherUserId: string
  let agentId: string
  const email = `vitest-agentmgmt-${Date.now()}@example.test`
  const otherEmail = `vitest-agentmgmt-other-${Date.now()}@example.test`

  beforeAll(async () => {
    const u = await db.user.create({ data: { email, name: "mgmt", businessName: "co" }, select: { id: true } })
    userId = u.id
    const o = await db.user.create({
      data: { email: otherEmail, name: "other", businessName: "co" },
      select: { id: true },
    })
    otherUserId = o.id
    const a = await db.agent.create({
      data: {
        userId,
        businessName: "Acme",
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
    await db.agent.deleteMany({ where: { userId } })
    await db.user.deleteMany({ where: { id: { in: [userId, otherUserId] } } })
  })

  it("lists the user's agents", async () => {
    const agents = await listAgentsForUser(userId)
    expect(agents.find((a) => a.id === agentId)?.businessName).toBe("Acme")
  })

  it("gets an owned agent and refuses non-owners / unknown ids", async () => {
    expect((await getAgentForUser(userId, agentId))?.id).toBe(agentId)
    expect(await getAgentForUser(otherUserId, agentId)).toBeNull()
    expect(await getAgentForUser(userId, "does-not-exist")).toBeNull()
  })

  it("sets and reads webhook tools (no EL connection → synced=false, ids filled)", async () => {
    const result = await setAgentToolsForUser(userId, agentId, [
      {
        name: "check_stock",
        description: "Check stock",
        url: "https://example.com/stock",
        method: "GET",
        parameters: [{ name: "sku", type: "string", description: "SKU", required: true }],
      },
    ])
    expect(result?.ok).toBe(true)
    expect(result?.synced).toBe(false)
    expect(result?.tools[0].id).toBeTruthy()
    expect(result?.tools[0].displayName).toBe("check_stock")

    const tools = await getAgentToolsForUser(userId, agentId)
    expect(tools?.length).toBe(1)
    expect(tools?.[0].name).toBe("check_stock")
    expect(tools?.[0].url).toBe("https://example.com/stock")
  })

  it("refuses tool reads/writes on a non-owned agent", async () => {
    expect(await setAgentToolsForUser(otherUserId, agentId, [])).toBeNull()
    expect(await getAgentToolsForUser(otherUserId, agentId)).toBeNull()
  })
})
