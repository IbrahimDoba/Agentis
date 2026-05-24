import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { db } from "@/lib/db"
import { getLeadsForUser } from "./leads"

// Seeds a user + agent + leads (one with a direct callerNumber, one whose
// number must be backfilled from ConversationLog, one with no number anywhere)
// to prove the pure-DB read resolves numbers correctly with no external calls.
describe("getLeadsForUser (real DB)", () => {
  const tag = `vitest-leads-${Date.now()}`
  let userId: string
  let agentId: string
  const convDirect = `${tag}-direct`
  const convFromLog = `${tag}-fromlog`
  const convNoNumber = `${tag}-nonumber`

  beforeAll(async () => {
    // Reuse a real agent + its owning user so FK constraints are satisfied.
    const agent = await db.agent.findFirst({ select: { id: true, userId: true } })
    if (!agent) throw new Error("No agent in dev DB")
    agentId = agent.id
    userId = agent.userId

    await db.lead.createMany({
      data: [
        { conversationId: convDirect, agentId, userId, callerNumber: "2348011110000" },
        { conversationId: convFromLog, agentId, userId, callerNumber: null },
        { conversationId: convNoNumber, agentId, userId, callerNumber: null },
      ],
    })

    // Only convFromLog has a ConversationLog with a phone number.
    await db.conversationLog.create({
      data: {
        conversationId: convFromLog,
        elevenlabsAgentId: "el-test",
        phoneNumber: "2348022220000",
        transcript: [],
        rawPayload: {},
      },
      select: { id: true },
    })
  }, 60_000)

  afterAll(async () => {
    await db.lead.deleteMany({
      where: { conversationId: { in: [convDirect, convFromLog, convNoNumber] } },
    })
    await db.conversationLog.deleteMany({
      where: { conversationId: { in: [convFromLog] } },
    })
  })

  it("returns the user's leads", async () => {
    const leads = await getLeadsForUser(db, userId)
    const ids = leads.map((l) => l.conversationId)
    expect(ids).toContain(convDirect)
    expect(ids).toContain(convFromLog)
    expect(ids).toContain(convNoNumber)
  })

  it("keeps a lead's own callerNumber", async () => {
    const leads = await getLeadsForUser(db, userId)
    const lead = leads.find((l) => l.conversationId === convDirect)!
    expect(lead.callerNumber).toBe("2348011110000")
  })

  it("backfills a missing number from ConversationLog", async () => {
    const leads = await getLeadsForUser(db, userId)
    const lead = leads.find((l) => l.conversationId === convFromLog)!
    expect(lead.callerNumber).toBe("2348022220000")
  })

  it("leaves callerNumber null when no source has it", async () => {
    const leads = await getLeadsForUser(db, userId)
    const lead = leads.find((l) => l.conversationId === convNoNumber)!
    expect(lead.callerNumber).toBeNull()
  })

  it("includes the agent display fields", async () => {
    const leads = await getLeadsForUser(db, userId)
    const lead = leads.find((l) => l.conversationId === convDirect)!
    expect(lead.agent).toHaveProperty("businessName")
    expect(lead.agent).toHaveProperty("profileImageUrl")
  })
})
