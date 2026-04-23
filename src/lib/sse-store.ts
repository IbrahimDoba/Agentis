/**
 * In-memory SSE subscriber store.
 * Keyed by agentId — any message event for an agent notifies all open streams.
 * Works for single-server / dev. For multi-instance production, swap for Redis pub/sub.
 */

type Controller = ReadableStreamDefaultController<Uint8Array>

const subscribers = new Map<string, Set<Controller>>()

export function subscribe(agentId: string, controller: Controller): () => void {
  if (!subscribers.has(agentId)) subscribers.set(agentId, new Set())
  subscribers.get(agentId)!.add(controller)

  // Return unsubscribe function
  return () => {
    subscribers.get(agentId)?.delete(controller)
    if (subscribers.get(agentId)?.size === 0) subscribers.delete(agentId)
  }
}

export function push(agentId: string, event: string, data: unknown): void {
  const subs = subscribers.get(agentId)
  if (!subs?.size) return

  const payload = new TextEncoder().encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
  for (const ctrl of subs) {
    try {
      ctrl.enqueue(payload)
    } catch {
      // Stream closed — subscriber will clean itself up
    }
  }
}
