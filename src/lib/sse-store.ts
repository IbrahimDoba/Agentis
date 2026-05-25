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
const subscribers = new Map<string, Set<Controller>>()

let subscriberClient: Redis | null = null
let subscriberStarted = false

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
  sub.subscribe(SSE_CHANNEL).catch(() => {})
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

// Encode + enqueue an event to every local controller for an agent.
function deliverLocal(agentId: string, event: string, data: unknown): void {
  const subs = subscribers.get(agentId)
  if (!subs?.size) return
  const payload = new TextEncoder().encode(
    `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
  )
  for (const ctrl of subs) {
    try {
      ctrl.enqueue(payload)
    } catch {
      // Stream closed — its abort handler will clean up.
    }
  }
}

export function subscribe(agentId: string, controller: Controller): () => void {
  ensureSubscriber()
  if (!subscribers.has(agentId)) subscribers.set(agentId, new Set())
  subscribers.get(agentId)!.add(controller)

  return () => {
    subscribers.get(agentId)?.delete(controller)
    if (subscribers.get(agentId)?.size === 0) subscribers.delete(agentId)
  }
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
  subscribers.clear()
}
