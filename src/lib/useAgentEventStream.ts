import { useEffect, useRef } from "react"
import { openAgentStream } from "@/lib/stream-client"

/**
 * Subscribe to an agent's server-sent event stream and invoke `onMessage`
 * whenever a real-time event arrives. Auto-reconnects on error with a short
 * backoff. Pass a falsy agentId to stay disconnected.
 *
 * The dashboard uses this to invalidate its React Query caches on push, so the
 * polling fallback can drop to a slow safety-net interval instead of hammering
 * the DB every 30s. The connection is opened via `openAgentStream`, which points
 * at the orchestrator (with a fresh ticket) when NEXT_PUBLIC_STREAM_URL is set,
 * or the in-app route otherwise — so each reconnect re-mints its ticket.
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

    const scheduleReconnect = () => {
      if (closed || reconnectTimer !== null) return
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null
        if (!closed) connect()
      }, 5000)
    }

    const connect = async () => {
      try {
        const es = await openAgentStream(agentId)
        if (closed) {
          es.close()
          return
        }
        source = es
        es.addEventListener("message", () => savedOnMessage.current())
        es.onerror = () => {
          // EventSource auto-reconnects on some errors, but on a hard close (or
          // an expired ticket) we re-create it — re-minting a fresh ticket.
          es.close()
          source = null
          scheduleReconnect()
        }
      } catch {
        // Ticket mint or connection setup failed — retry on the same backoff.
        scheduleReconnect()
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
