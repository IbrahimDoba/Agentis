import { NextRequest } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { subscribe } from "@/lib/sse-store"

// Agent-level SSE stream for the dashboard. Emits every real-time event for an
// agent (new inbound/outbound messages, etc.) so the chats view can invalidate
// its queries on demand instead of polling. Events are published cross-process
// via Redis (see src/lib/sse-store.ts), so an AI reply persisted by the
// orchestrator reaches this stream too.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session) return new Response("Unauthorized", { status: 401 })

  const { id: agentId } = await params

  const agent = await db.agent.findUnique({
    where: { id: agentId },
    select: { userId: true },
  })
  if (!agent) return new Response("Not found", { status: 404 })
  if (agent.userId !== session.user.id && session.user.role !== "ADMIN") {
    return new Response("Forbidden", { status: 403 })
  }

  const encoder = new TextEncoder()

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      // Initial comment so the browser marks the stream open immediately.
      controller.enqueue(encoder.encode(": connected\n\n"))

      const unsub = subscribe(agentId, controller)

      // Keepalive comment every 25s so proxies/load balancers don't drop the
      // idle connection. SSE comment lines (": ...") are ignored by EventSource.
      const keepalive = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(": ping\n\n"))
        } catch {
          /* stream closed — abort handler cleans up */
        }
      }, 25000)

      req.signal.addEventListener("abort", () => {
        clearInterval(keepalive)
        unsub()
        try {
          controller.close()
        } catch {
          /* already closed */
        }
      })
    },
  })

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  })
}
