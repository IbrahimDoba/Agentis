import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { db } from "@/lib/db"
import {
  getConversationMessages,
  DEFAULT_MESSAGE_LIMIT,
  MAX_MESSAGE_LIMIT,
} from "./messages"

// Seed a conversation with a known number of messages so windowing/cursor
// behaviour is deterministic regardless of existing dev data. Cleaned up after.
describe("getConversationMessages (real DB)", () => {
  const TOTAL = 60 // > DEFAULT_MESSAGE_LIMIT so pagination kicks in
  let agentId: string
  let conversationId: string
  const phone = `vitest-msg-${Date.now()}`

  beforeAll(async () => {
    const agent = await db.agent.findFirst({ select: { id: true } })
    if (!agent) throw new Error("No agent in dev DB")
    agentId = agent.id

    const convo = await db.conversation.create({
      data: { agentId, phoneNumber: phone, mode: "ai", channel: "embed" },
      select: { id: true },
    })
    conversationId = convo.id

    // Seed with strictly increasing timestamps so ordering is deterministic.
    // createMany is a single round trip (no per-row RETURNING) — faster and
    // avoids referencing newer columns the local dev DB may not have yet
    // (e.g. richContent), which a full-row RETURNING would choke on.
    const base = Date.now()
    await db.message.createMany({
      data: Array.from({ length: TOTAL }, (_, i) => ({
        conversationId,
        direction: i % 2 === 0 ? "inbound" : "outbound",
        content: `msg-${i}`,
        createdAt: new Date(base + i * 1000),
      })),
    })
  }, 60_000)

  afterAll(async () => {
    await db.message.deleteMany({ where: { conversationId } })
    await db.conversation.deleteMany({ where: { id: conversationId } })
  })

  it("returns the newest DEFAULT_MESSAGE_LIMIT messages, chronological", async () => {
    const page = await getConversationMessages(db, conversationId)
    expect(page.messages.length).toBe(DEFAULT_MESSAGE_LIMIT)
    // chronological: first is older than last
    expect(page.messages[0].createdAt.getTime()).toBeLessThan(
      page.messages[page.messages.length - 1].createdAt.getTime()
    )
    // newest window = msgs 10..59; oldest shown is msg-10, newest is msg-59
    expect(page.messages[0].content).toBe("msg-10")
    expect(page.messages[page.messages.length - 1].content).toBe("msg-59")
  })

  it("reports hasMore + a cursor when older messages exist", async () => {
    const page = await getConversationMessages(db, conversationId)
    expect(page.hasMore).toBe(true)
    expect(page.nextCursor).toBeTruthy()
  })

  it("loads the older page via the cursor with no overlap", async () => {
    const first = await getConversationMessages(db, conversationId)
    const older = await getConversationMessages(db, conversationId, {
      before: first.nextCursor!,
    })
    // remaining 10 older messages (msg-0..msg-9)
    expect(older.messages.length).toBe(10)
    expect(older.messages[0].content).toBe("msg-0")
    expect(older.messages[older.messages.length - 1].content).toBe("msg-9")
    expect(older.hasMore).toBe(false)
    expect(older.nextCursor).toBeNull()

    // no overlap between pages
    const firstIds = new Set(first.messages.map((m) => m.id))
    expect(older.messages.every((m) => !firstIds.has(m.id))).toBe(true)
  })

  it("respects a custom limit", async () => {
    const page = await getConversationMessages(db, conversationId, { limit: 10 })
    expect(page.messages.length).toBe(10)
    expect(page.messages[page.messages.length - 1].content).toBe("msg-59")
    expect(page.hasMore).toBe(true)
  })

  it("clamps an over-large limit to MAX_MESSAGE_LIMIT", async () => {
    const page = await getConversationMessages(db, conversationId, { limit: 9999 })
    // only 60 messages exist, all returned, no more
    expect(page.messages.length).toBe(TOTAL)
    expect(page.messages.length).toBeLessThanOrEqual(MAX_MESSAGE_LIMIT)
    expect(page.hasMore).toBe(false)
  })

  it("returns an empty page for an unknown conversation", async () => {
    const page = await getConversationMessages(db, "does-not-exist")
    expect(page.messages).toEqual([])
    expect(page.hasMore).toBe(false)
    expect(page.nextCursor).toBeNull()
  })
})
