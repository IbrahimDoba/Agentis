// Per-agent timestamp of the last real inbound message event (messages.upsert).
// Powers the deaf-session watchdog: a Baileys v7 "deaf session" stays CONNECTED
// with healthy keepalive but silently stops delivering messages.upsert, so the
// built-in liveness check can't see it (its own ping-pong refreshes that timer).
// We track real message activity instead. Seeded on connect so a fresh/quiet
// session isn't mistaken for a stalled one; in-memory, so reconnects reset it
// (avoids the stale-timestamp reconnect-loop pitfall).
const lastInboundAt = new Map<string, number>()

export function markInboundActivity(agentId: string): void {
  lastInboundAt.set(agentId, Date.now())
}

export function getLastInboundAt(agentId: string): number | undefined {
  return lastInboundAt.get(agentId)
}

export function clearInboundActivity(agentId: string): void {
  lastInboundAt.delete(agentId)
}

export function trackedAgents(): string[] {
  return [...lastInboundAt.keys()]
}
