import { useEffect, useRef } from "react"

/**
 * Subscribe to an agent's server-sent event stream and invoke `onMessage`
 * whenever a real-time event arrives. Auto-reconnects on error with a short
 * backoff. Pass a falsy agentId to stay disconnected.
 *
 * The dashboard uses this to invalidate its React Query caches on push, so the
 * polling fallback can drop to a slow safety-net interval instead of hammering
 * the DB every 30s.
 */
export function useAgentEventStream(
  agentId: string | null | undefined,
  onMessage: () => void
): void {
  const savedOnMessage = useRef(onMessage)
  useEffect(() => {
    savedOnMessage.current = onMessage
  }, [onMessage])

  useEffect(() => {
    if (!agentId || typeof window === "undefined" || typeof EventSource === "undefined") {
      return
    }

    let source: EventSource | null = null
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null
    let closed = false

    const connect = () => {
      source = new EventSource(`/api/agents/${agentId}/stream`)
      source.addEventListener("message", () => savedOnMessage.current())
      source.onerror = () => {
        // EventSource auto-reconnects on some errors, but on a hard close we
        // re-create it after a short delay.
        source?.close()
        source = null
        if (!closed && reconnectTimer === null) {
          reconnectTimer = setTimeout(() => {
            reconnectTimer = null
            if (!closed) connect()
          }, 5000)
        }
      }
    }

    connect()

    return () => {
      closed = true
      if (reconnectTimer !== null) clearTimeout(reconnectTimer)
      source?.close()
    }
  }, [agentId])
}
