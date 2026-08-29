import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { db } from "@/lib/db"
import { buildOrchestratorSystemPrompt } from "@/lib/orchestratorSync"
import { writeAgentPromptField } from "./agentPromptWrite"

describe("writeAgentPromptField (real DB)", () => {
  let userId: string
  let orchAgentId: string
  let elevenAgentId: string
  const email = `vitest-promptwrite-${Date.now()}@example.test`

  beforeAll(async () => {
    const u = await db.user.create({
      data: { email, name: "pw", businessName: "co" },
      select: { id: true },
    })
    userId = u.id

    const base = {
      userId,
      businessDescription: "d",
      productsServices: "p",
      faqs: "f",
      operatingHours: "9-5",
    }

    const orch = await db.agent.create({
      data: { ...base, businessName: "Orch", agentRuntime: "orchestrator", responseGuidelines: "Original prompt." },
      select: { id: true },
    })
    orchAgentId = orch.id
    // Two orchestrator rows: the schema permits it, and update() would throw.
    for (const name of ["primary", "secondary"]) {
      await db.orchestratorAgent.create({
        data: { agentId: orchAgentId, name, systemPrompt: "Original prompt." },
      })
    }

    const el = await db.agent.create({
      data: { ...base, businessName: "El", agentRuntime: "elevenlabs", responseGuidelines: "Original." },
      select: { id: true },
    })
    elevenAgentId = el.id
  })

  afterAll(async () => {
    await db.agent.deleteMany({ where: { userId } })
    await db.user.deleteMany({ where: { id: userId } })
  })

  // The regression test for the whole feature: an edit that updates only one of
  // the two copies has no effect on the running agent.
  it("updates responseGuidelines AND every OrchestratorAgent.systemPrompt", async () => {
    const value = "Open Mon-Sat 9am-7pm."
    await writeAgentPromptField(orchAgentId, "responseGuidelines", value)

    const agent = await db.agent.findUnique({
      where: { id: orchAgentId },
      select: { responseGuidelines: true },
    })
    expect(agent?.responseGuidelines).toBe(value)

    const rows = await db.orchestratorAgent.findMany({ where: { agentId: orchAgentId } })
    expect(rows).toHaveLength(2)
    for (const r of rows) expect(r.systemPrompt).toBe(buildOrchestratorSystemPrompt(value))
  })

  it("applies the passthrough fallback for a whitespace-only value", async () => {
    await writeAgentPromptField(orchAgentId, "responseGuidelines", "   ")
    const row = await db.orchestratorAgent.findFirst({ where: { agentId: orchAgentId } })
    expect(row?.systemPrompt).toBe("You are a helpful WhatsApp assistant.")
  })

  it("writes the agent row but no orchestrator row for an elevenlabs agent", async () => {
    await writeAgentPromptField(elevenAgentId, "responseGuidelines", "El prompt.")
    const agent = await db.agent.findUnique({
      where: { id: elevenAgentId },
      select: { responseGuidelines: true },
    })
    expect(agent?.responseGuidelines).toBe("El prompt.")
    expect(await db.orchestratorAgent.count({ where: { agentId: elevenAgentId } })).toBe(0)
  })

  it("refuses a field outside the allow-list and leaves the row untouched", async () => {
    const before = await db.agent.findUnique({ where: { id: orchAgentId } })
    await expect(
      // Cast past the type guard the way a careless future caller would.
      writeAgentPromptField(orchAgentId, "elevenlabsAgentId" as never, "hacked")
    ).rejects.toThrow(/disallowed field/)
    const after = await db.agent.findUnique({ where: { id: orchAgentId } })
    expect(after).toEqual(before)
  })

  it("throws for an unknown agent", async () => {
    await expect(
      writeAgentPromptField("does-not-exist", "responseGuidelines", "x")
    ).rejects.toThrow(/not found/)
  })
})
