import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { db } from "@/lib/db"
import { getOverviewCounts } from "./conversationStats"

// Asserted as DELTAS against a baseline: the dev DB already holds unrelated
// rows, so absolute counts would be a moving target.
describe("getOverviewCounts (real DB)", () => {
  const TAG = Date.now().toString().slice(-8)
  const phone = (n: number) => `99991${n}${TAG}`

  let agentId: string
  let ownerId: string
  let baseline: Awaited<ReturnType<typeof getOverviewCounts>>
  const conversationIds: string[] = []

  async function seed(data: {
    phoneNumber: string
    channel?: string
    deletedAt?: Date
    lastActivityAt?: Date
    messages?: number
    lead?: boolean
  }) {
    const conversation = await db.conversation.create({
      data: {
        agentId,
        phoneNumber: data.phoneNumber,
        channel: data.channel ?? "whatsapp",
        deletedAt: data.deletedAt ?? null,
        lastActivityAt: data.lastActivityAt ?? new Date(),
      },
      select: { id: true },
    })
    conversationIds.push(conversation.id)

    for (let i = 0; i < (data.messages ?? 0); i++) {
      await db.message.create({
        data: {
          conversationId: conversation.id,
          direction: "outbound",
          senderRole: "ai",
          content: `vitest ${TAG} ${i}`,
        },
      })
    }

    if (data.lead) {
      await db.lead.create({
        data: { conversationId: conversation.id, agentId, userId: ownerId },
      })
    }
    return conversation.id
  }

  beforeAll(async () => {
    const agent = await db.agent.findFirst({ select: { id: true, userId: true } })
    if (!agent) throw new Error("No agent in dev DB — cannot run overview count tests")
    agentId = agent.id
    ownerId = agent.userId

    baseline = await getOverviewCounts([agentId], ownerId, null)

    // Counts: a plain conversation with two AI replies.
    await seed({ phoneNumber: phone(1), messages: 2 })
    // Counts, and is the Leads Rate numerator.
    await seed({ phoneNumber: phone(2), messages: 1, lead: true })
    // Hidden: soft-deleted with no activity since the delete.
    await seed({
      phoneNumber: phone(3),
      messages: 3,
      lastActivityAt: new Date(Date.now() - 60_000),
      deletedAt: new Date(),
    })
    // Hidden: embed visitor who opened the widget and never typed.
    await seed({ phoneNumber: phone(4), channel: "embed" })
    // Counts: an embed chat that did get a message.
    await seed({ phoneNumber: phone(5), channel: "embed", messages: 1 })
  })

  afterAll(async () => {
    await db.lead.deleteMany({ where: { conversationId: { in: conversationIds } } })
    await db.conversation.deleteMany({ where: { id: { in: conversationIds } } })
  })

  it("counts only the conversations the Chats tab shows", async () => {
    const after = await getOverviewCounts([agentId], ownerId, null)
    // 5 seeded, 2 hidden (soft-deleted + empty embed).
    expect(after.conversations - baseline.conversations).toBe(3)
  })

  it("excludes AI messages belonging to hidden conversations", async () => {
    const after = await getOverviewCounts([agentId], ownerId, null)
    // 2 + 1 + 1 visible; the soft-deleted conversation's 3 do not count.
    expect(after.aiMessages - baseline.aiMessages).toBe(4)
  })

  it("counts distinct contacts without materialising them", async () => {
    const after = await getOverviewCounts([agentId], ownerId, null)
    expect(after.contacts - baseline.contacts).toBe(3)
  })

  it("counts converted conversations, not leads created", async () => {
    const after = await getOverviewCounts([agentId], ownerId, null)
    expect(after.converted - baseline.converted).toBe(1)
  })

  it("never reports more conversions than conversations", async () => {
    const after = await getOverviewCounts([agentId], ownerId, null)
    expect(after.converted).toBeLessThanOrEqual(after.conversations)
  })

  it("returns zeroes for an empty agent list without querying", async () => {
    const counts = await getOverviewCounts([], ownerId, null)
    expect(counts).toEqual({ conversations: 0, contacts: 0, converted: 0, aiMessages: 0 })
  })

  it("scopes to the window when given one", async () => {
    const future = new Date(Date.now() + 60_000)
    const counts = await getOverviewCounts([agentId], ownerId, future)
    expect(counts.conversations).toBe(0)
    expect(counts.aiMessages).toBe(0)
  })
})
