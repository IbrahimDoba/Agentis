import { NextRequest } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { subscribe } from "@/lib/sse-store"

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session) return new Response("Unauthorized", { status: 401 })

  const { id: conversationId } = await params

  const conversation = await db.conversation.findUnique({
    where: { id: conversationId },
    select: { agentId: true, agent: { select: { userId: true } } },
  })
  if (!conversation) return new Response("Not found", { status: 404 })
  if (conversation.agent.userId !== session.user.id && session.user.role !== "ADMIN") {
    return new Response("Forbidden", { status: 403 })
  }

  const { agentId } = conversation
  const encoder = new TextEncoder()

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      // Send initial ping so the browser knows the stream is live
      controller.enqueue(encoder.encode(": ping\n\n"))

      const unsub = subscribe(agentId, controller)

      // Clean up when client disconnects
      req.signal.addEventListener("abort", () => {
        unsub()
        try { controller.close() } catch { /* already closed */ }
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
