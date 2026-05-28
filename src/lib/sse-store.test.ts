import { describe, it, expect, afterAll, vi } from "vitest"
import {
  subscribe,
  subscribeByConversation,
  publish,
  __resetForTests,
  __waitForSubscriberReadyForTests,
} from "./sse-store"

// Fake SSE controller capturing enqueued bytes as decoded strings.
function fakeController() {
  const events: string[] = []
  const decoder = new TextDecoder()
  return {
    events,
    ctrl: {
      enqueue: (chunk: Uint8Array) => events.push(decoder.decode(chunk)),
    } as unknown as ReadableStreamDefaultController<Uint8Array>,
  }
}

// publish() goes Redis command client -> channel -> subscriber duplicate
// connection -> deliverLocal. Poll briefly for the async round trip.
async function waitFor(fn: () => boolean, timeoutMs = 3000): Promise<void> {
  const start = Date.now()
  while (!fn()) {
    if (Date.now() - start > timeoutMs) throw new Error("timeout waiting for SSE event")
    await new Promise((r) => setTimeout(r, 25))
  }
}

describe("sse-store pub/sub (real Redis)", () => {
  afterAll(() => {
    __resetForTests()
  })

  it("delivers a published event to a subscribed controller for the same agent", async () => {
    const agentId = `vitest-agent-${Date.now()}`
    const { events, ctrl } = fakeController()
    const unsub = subscribe(agentId, ctrl)
    // First subscribe in the process — wait for the Redis SUBSCRIBE handshake
    // before the first publish, otherwise the message is lost to the race.
    await __waitForSubscriberReadyForTests()

    await publish(agentId, "message", { conversationId: "c1" })
    await waitFor(() => events.length > 0)

    expect(events[0]).toContain("event: message")
    expect(events[0]).toContain('"conversationId":"c1"')
    unsub()
  })

  it("does NOT deliver events for a different agent", async () => {
    const agentA = `vitest-A-${Date.now()}`
    const agentB = `vitest-B-${Date.now()}`
    const a = fakeController()
    const b = fakeController()
    const unsubA = subscribe(agentA, a.ctrl)
    const unsubB = subscribe(agentB, b.ctrl)

    await publish(agentA, "message", { n: 1 })
    await waitFor(() => a.events.length > 0)

    // Give any cross-delivery a chance to (wrongly) arrive.
    await new Promise((r) => setTimeout(r, 150))
    expect(a.events.length).toBe(1)
    expect(b.events.length).toBe(0)
    unsubA()
    unsubB()
  })

  it("stops delivering after unsubscribe", async () => {
    const agentId = `vitest-unsub-${Date.now()}`
    const { events, ctrl } = fakeController()
    const unsub = subscribe(agentId, ctrl)
    unsub()

    await publish(agentId, "message", { n: 2 })
    await new Promise((r) => setTimeout(r, 200))
    expect(events.length).toBe(0)
  })

  it("fans out to multiple controllers on the same agent", async () => {
    const agentId = `vitest-multi-${Date.now()}`
    const c1 = fakeController()
    const c2 = fakeController()
    const u1 = subscribe(agentId, c1.ctrl)
    const u2 = subscribe(agentId, c2.ctrl)

    await publish(agentId, "message", { n: 3 })
    await waitFor(() => c1.events.length > 0 && c2.events.length > 0)

    expect(c1.events.length).toBe(1)
    expect(c2.events.length).toBe(1)
    u1()
    u2()
  })

  it("delivers to a per-conversation subscriber when data.conversationId matches", async () => {
    const agentId = `vitest-conv-agent-${Date.now()}`
    const conversationId = `vitest-conv-${Date.now()}`
    const { events, ctrl } = fakeController()
    const unsub = subscribeByConversation(conversationId, ctrl)

    await publish(agentId, "message", { conversationId, body: "hi" })
    await waitFor(() => events.length > 0)
    expect(events[0]).toContain('"body":"hi"')
    unsub()
  })

  it("does NOT deliver to a per-conversation subscriber when conversationId differs", async () => {
    const agentId = `vitest-conv-iso-${Date.now()}`
    const subscribed = `subscribed-${Date.now()}`
    const other = `other-${Date.now()}`
    const { events, ctrl } = fakeController()
    const unsub = subscribeByConversation(subscribed, ctrl)

    await publish(agentId, "message", { conversationId: other })
    await new Promise((r) => setTimeout(r, 150))
    expect(events.length).toBe(0)
    unsub()
  })

  it("delivers a matching event to BOTH the agent and conversation subscribers, exactly once each", async () => {
    const agentId = `vitest-both-${Date.now()}`
    const conversationId = `vitest-both-c-${Date.now()}`
    const agentSub = fakeController()
    const convSub = fakeController()
    const u1 = subscribe(agentId, agentSub.ctrl)
    const u2 = subscribeByConversation(conversationId, convSub.ctrl)

    await publish(agentId, "message", { conversationId, n: 1 })
    await waitFor(() => agentSub.events.length > 0 && convSub.events.length > 0)
    expect(agentSub.events.length).toBe(1)
    expect(convSub.events.length).toBe(1)
    u1()
    u2()
  })
})
