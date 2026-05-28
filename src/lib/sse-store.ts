/**
 * SSE subscriber store backed by Redis pub/sub.
 *
 * Each process keeps a local registry of open SSE controllers keyed by agentId.
 * A single Redis SUBSCRIBER connection per process listens on one channel and
 * fans incoming events out to the matching local controllers. `push()` (or
 * `publish()`) writes to that channel via the normal command client, so an
 * event raised in ANY process — Next.js (any serverless instance), the
 * orchestrator, or the worker — reaches every dashboard stream.
 *
 * Cross-service contract (orchestrator/worker publish the same shape):
 *   channel: "sse:events"
 *   message: JSON { agentId: string, event: string, data: unknown }
 *
 * Best-effort: if Redis is unavailable we deliver locally only (single-process
 * dev still works) and never throw.
 */
import type Redis from "ioredis"
import { getRedis } from "./redis"

type Controller = ReadableStreamDefaultController<Uint8Array>

export const SSE_CHANNEL = "sse:events"

// agentId -> set of open SSE controllers in THIS process.
const subscribersByAgent = new Map<string, Set<Controller>>()

// conversationId -> set of open SSE controllers (e.g. widget visitors who
// only care about one conversation, not the whole agent).
const subscribersByConversation = new Map<string, Set<Controller>>()

let subscriberClient: Redis | null = null
let subscriberStarted = false
// Awaitable readiness — the Redis SUBSCRIBE command is async, so a publish
// issued in the same tick as the first subscribe() can race ahead. Tests
// (and any caller that needs a guaranteed-delivered first event) await this.
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
  controller: Controller
): () => void {
  ensureSubscriber()
  if (!registry.has(key)) registry.set(key, new Set())
  registry.get(key)!.add(controller)
  return () => {
    registry.get(key)?.delete(controller)
    if (registry.get(key)?.size === 0) registry.delete(key)
  }
}

export function subscribe(agentId: string, controller: Controller): () => void {
  return addSubscriber(subscribersByAgent, agentId, controller)
}

/**
 * Subscribe a controller to events for a single conversation. Used by the
 * widget visitor stream — they only care about their own conversation, not
 * the whole agent's traffic.
 */
export function subscribeByConversation(conversationId: string, controller: Controller): () => void {
  return addSubscriber(subscribersByConversation, conversationId, controller)
}

/**
 * Publish an event to all processes via Redis. Falls back to local-only
 * delivery when Redis is unavailable. Safe to await; never throws.
 */
export async function publish(agentId: string, event: string, data: unknown): Promise<void> {
  const redis = getRedis()
  if (!redis) {
    deliverLocal(agentId, event, data)
    return
  }
  try {
    await redis.publish(SSE_CHANNEL, JSON.stringify({ agentId, event, data }))
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
  subscriberReady = Promise.resolve()
}

// Test-only: await the Redis SUBSCRIBE handshake so the first publish in a
// test isn't lost to a still-pending subscribe.
export function __waitForSubscriberReadyForTests(): Promise<void> {
  return subscriberReady
}
