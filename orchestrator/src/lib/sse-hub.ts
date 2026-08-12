import type { Redis } from "ioredis"
import { getRedis } from "../queue/redis.js"

// Node-side port of the Next.js SSE fan-out (src/lib/sse-store.ts), terminating
// browser SSE connections on the persistent orchestrator instead of on Vercel
// serverless (each held-open serverless invocation bills GB-hours; one Node
// process holds thousands of connections on its event loop for a flat cost).
//
// One duplicated Redis SUBSCRIBER connection per process listens on the shared
// per-agent channels ("sse:events:<agentId>") that the orchestrator/worker
// already publish to, and fans each event out to the local writers for that
// agent. Channels are subscribed/unsubscribed refcounted per agent, so a process
// only receives events for agents it currently serves.
//
// A "writer" is just a function that appends a pre-encoded SSE frame to one open
// HTTP response (reply.raw.write). Best-effort throughout: Redis hiccups and
// dead sockets are swallowed, never thrown.

type Writer = (frame: string) => void

const SSE_CHANNEL = "sse:events"
const channelFor = (agentId: string) => `${SSE_CHANNEL}:${agentId}`

const subscribersByAgent = new Map<string, Set<Writer>>()
const agentChannelRefs = new Map<string, number>()

let subscriber: Redis | null = null
let started = false

function ensureSubscriber(): void {
  if (started) return
  started = true
  // A connection in subscribe mode can't issue normal commands, so duplicate
  // the shared client into a dedicated subscriber.
  const sub = getRedis().duplicate()
  sub.on("error", () => {}) // never crash on a Redis hiccup
  sub.on("message", (_channel: string, raw: string) => {
    try {
      const { agentId, event, data } = JSON.parse(raw)
      deliver(agentId, event, data)
    } catch {
      // Ignore malformed messages.
    }
  })
  subscriber = sub
}

function retainAgentChannel(agentId: string): void {
  const next = (agentChannelRefs.get(agentId) ?? 0) + 1
  agentChannelRefs.set(agentId, next)
  if (next === 1) subscriber?.subscribe(channelFor(agentId)).catch(() => {})
}

function releaseAgentChannel(agentId: string): void {
  const cur = agentChannelRefs.get(agentId) ?? 0
  if (cur <= 1) {
    agentChannelRefs.delete(agentId)
    subscriber?.unsubscribe(channelFor(agentId)).catch(() => {})
  } else {
    agentChannelRefs.set(agentId, cur - 1)
  }
}

function deliver(agentId: string, event: string, data: unknown): void {
  const subs = subscribersByAgent.get(agentId)
  if (!subs?.size) return
  const frame = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
  for (const write of subs) {
    try {
      write(frame)
    } catch {
      // Socket closed — the route's close handler unsubscribes it.
    }
  }
}

// Register a writer for an agent's events. Returns an idempotent unsubscribe.
export function subscribeAgent(agentId: string, write: Writer): () => void {
  ensureSubscriber()
  retainAgentChannel(agentId)
  let set = subscribersByAgent.get(agentId)
  if (!set) {
    set = new Set()
    subscribersByAgent.set(agentId, set)
  }
  set.add(write)

  let released = false
  return () => {
    if (released) return
    released = true
    const s = subscribersByAgent.get(agentId)
    s?.delete(write)
    if (s && s.size === 0) subscribersByAgent.delete(agentId)
    releaseAgentChannel(agentId)
  }
}
