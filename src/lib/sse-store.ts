/**
 * SSE subscriber store backed by Redis pub/sub.
 *
 * Each process keeps a local registry of open SSE controllers keyed by agentId.
 * A single Redis SUBSCRIBER connection per process listens and fans incoming
 * events out to the matching local controllers. `push()` (or `publish()`)
 * writes via the normal command client, so an event raised in ANY process —
 * Next.js (any serverless instance), the orchestrator, or the worker — reaches
 * every dashboard stream.
 *
 * Channels are PER-AGENT (`sse:events:<agentId>`) so an instance only receives
 * (and JSON-parses) events for the agents it actually serves, instead of every
 * event on the platform. The legacy global channel (`sse:events`) stays
 * subscribed as a transitional safety net so a not-yet-redeployed publisher is
 * still delivered; once every service publishes per-agent it goes silent (and
 * can be dropped in a follow-up).
 *
 * Cross-service contract (orchestrator/worker publish the same shape):
 *   channel: "sse:events:<agentId>"
 *   message: JSON { agentId: string, event: string, data: unknown }
 *
 * Best-effort: if Redis is unavailable we deliver locally only (single-process
 * dev still works) and never throw.
 */
import type Redis from "ioredis"
import { getRedis } from "./redis"

type Controller = ReadableStreamDefaultController<Uint8Array>

// Legacy global channel — kept subscribed only as a migration safety net.
export const SSE_CHANNEL = "sse:events"
const channelFor = (agentId: string) => `${SSE_CHANNEL}:${agentId}`

// agentId -> set of open SSE controllers in THIS process.
const subscribersByAgent = new Map<string, Set<Controller>>()

// conversationId -> set of open SSE controllers (e.g. widget visitors who
// only care about one conversation, not the whole agent).
const subscribersByConversation = new Map<string, Set<Controller>>()

// agentId -> number of local controllers (agent + conversation) that depend on
// that agent's Redis channel. We hold exactly one channel subscription per
// served agent and drop it when the last subscriber for it disconnects.
const agentChannelRefs = new Map<string, number>()

let subscriberClient: Redis | null = null
let subscriberStarted = false
// Awaitable readiness — the Redis SUBSCRIBE command is async, so a publish
// issued in the same tick as the first subscribe() can race ahead. Tracks the
// global handshake AND every per-agent SUBSCRIBE, so tests (and any caller that
// needs a guaranteed-delivered first event) can await it.
let subscriberReady: Promise<void> = Promise.resolve()

// Lazily stand up the single Redis subscriber connection for this process.
// A connection in subscribe mode can't issue normal commands, so we duplicate
// the command client.
function ensureSubscriber(): void {
  if (subscriberStarted) return
  subscriberStarted = true

  const base = getRedis()
  if (!base) return // no Redis — local-only delivery

  const sub = base.duplicate()
  sub.on("error", () => {}) // best-effort; never crash on Redis hiccups
  subscriberReady = sub.subscribe(SSE_CHANNEL).then(
    () => {},
    () => {}
  )
  sub.on("message", (_channel: string, raw: string) => {
    try {
      const { agentId, event, data } = JSON.parse(raw)
      deliverLocal(agentId, event, data)
    } catch {
      // Ignore malformed messages.
    }
  })
  subscriberClient = sub
}

// Hold a per-agent channel subscription, refcounted. Subscribes on 0->1 and
// folds the async SUBSCRIBE into `subscriberReady` so a same-tick publish can
// be awaited in tests.
function retainAgentChannel(agentId: string): void {
  const next = (agentChannelRefs.get(agentId) ?? 0) + 1
  agentChannelRefs.set(agentId, next)
  if (next === 1 && subscriberClient) {
    const p = subscriberClient.subscribe(channelFor(agentId)).then(
      () => {},
      () => {}
    )
    subscriberReady = Promise.all([subscriberReady, p]).then(() => {})
  }
}

// Release a per-agent channel subscription; unsubscribes on 1->0.
function releaseAgentChannel(agentId: string): void {
  const cur = agentChannelRefs.get(agentId) ?? 0
  if (cur <= 1) {
    agentChannelRefs.delete(agentId)
    subscriberClient?.unsubscribe(channelFor(agentId)).catch(() => {})
  } else {
    agentChannelRefs.set(agentId, cur - 1)
  }
}

// Encode + enqueue an event to every local controller for an agent AND every
// per-conversation subscriber whose conversationId matches data.conversationId.
function deliverLocal(agentId: string, event: string, data: unknown): void {
  const agentSubs = subscribersByAgent.get(agentId)
  const conversationId =
    data && typeof data === "object" && "conversationId" in data
      ? (data as { conversationId?: string }).conversationId
      : undefined
  const conversationSubs = conversationId
    ? subscribersByConversation.get(conversationId)
    : undefined
  if (!agentSubs?.size && !conversationSubs?.size) return

  const payload = new TextEncoder().encode(
    `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
  )
  const sent = new Set<Controller>()
  const fanout = (subs: Set<Controller> | undefined) => {
    if (!subs) return
    for (const ctrl of subs) {
      if (sent.has(ctrl)) continue
      sent.add(ctrl)
      try {
        ctrl.enqueue(payload)
      } catch {
        // Stream closed — abort handler cleans up.
      }
    }
  }
  fanout(agentSubs)
  fanout(conversationSubs)
}

function addSubscriber(
  registry: Map<string, Set<Controller>>,
  key: string,
  agentId: string,
  controller: Controller
): () => void {
  ensureSubscriber()
  retainAgentChannel(agentId)
  if (!registry.has(key)) registry.set(key, new Set())
  registry.get(key)!.add(controller)
  let released = false
  return () => {
    if (released) return // idempotent — guard double-unsub from refcounting twice
    released = true
    registry.get(key)?.delete(controller)
    if (registry.get(key)?.size === 0) registry.delete(key)
    releaseAgentChannel(agentId)
  }
}

export function subscribe(agentId: string, controller: Controller): () => void {
  return addSubscriber(subscribersByAgent, agentId, agentId, controller)
}

/**
 * Subscribe a controller to events for a single conversation. Used by the
 * widget visitor stream — they only care about their own conversation, not the
 * whole agent's traffic. `agentId` is required so we know which per-agent Redis
 * channel to listen on.
 */
export function subscribeByConversation(
  agentId: string,
  conversationId: string,
  controller: Controller
): () => void {
  return addSubscriber(subscribersByConversation, conversationId, agentId, controller)
}

/**
 * Publish an event to all processes via the agent's Redis channel. Falls back
 * to local-only delivery when Redis is unavailable. Safe to await; never throws.
 */
export async function publish(agentId: string, event: string, data: unknown): Promise<void> {
  const redis = getRedis()
  if (!redis) {
    deliverLocal(agentId, event, data)
    return
  }
  try {
    await redis.publish(channelFor(agentId), JSON.stringify({ agentId, event, data }))
  } catch {
    deliverLocal(agentId, event, data)
  }
}

/** Fire-and-forget variant for callers that aren't async. */
export function push(agentId: string, event: string, data: unknown): void {
  void publish(agentId, event, data)
}

// Test-only: tear down the subscriber + registry between test files.
export function __resetForTests(): void {
  try {
    subscriberClient?.disconnect()
  } catch {
    /* ignore */
  }
  subscriberClient = null
  subscriberStarted = false
  subscribersByAgent.clear()
  subscribersByConversation.clear()
  agentChannelRefs.clear()
  subscriberReady = Promise.resolve()
}

// Test-only: await the Redis SUBSCRIBE handshakes (global + per-agent) so the
// first publish in a test isn't lost to a still-pending subscribe.
export function __waitForSubscriberReadyForTests(): Promise<void> {
  return subscriberReady
}
