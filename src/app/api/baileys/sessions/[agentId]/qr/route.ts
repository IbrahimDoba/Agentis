import { requireAgentAccess } from "@/lib/agentAccess"

/**
 * SSE proxy — streams QR codes from the worker to the browser.
 * The browser connects here; we forward the worker's SSE stream.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ agentId: string }> }) {
  const { agentId } = await params
  const access = await requireAgentAccess(agentId)
  if (!access.ok) {
    return access.reason === "UNAUTHENTICATED"
      ? new Response("Unauthorized", { status: 401 })
      : new Response("Not found", { status: 404 })
  }

  const workerUrl = process.env.WORKER_URL ?? "http://localhost:4000"
  const apiKey = process.env.WORKER_API_KEY ?? ""

  const upstream = await fetch(`${workerUrl}/v1/sessions/${agentId}/qr`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  })

  if (!upstream.ok || !upstream.body) {
    return new Response("Worker unavailable", { status: 502 })
  }

  return new Response(upstream.body, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  })
}
