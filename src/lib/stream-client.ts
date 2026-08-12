// Opens an agent-level SSE stream for the dashboard.
//
// When NEXT_PUBLIC_STREAM_URL is set, the browser connects to the persistent
// orchestrator with a short-lived ticket (minted by /api/stream-token) so no
// Vercel serverless function stays open per viewer. When it's unset, it falls
// back to the in-app route — so this can be rolled out (and rolled back) purely
// by flipping the env var, with the old routes still in place.
//
// Async because the orchestrator path mints a ticket first. Callers should
// re-invoke this on reconnect so each connection gets a fresh ticket.
const STREAM_BASE = process.env.NEXT_PUBLIC_STREAM_URL

export async function openAgentStream(agentId: string): Promise<EventSource> {
  if (!STREAM_BASE) {
    return new EventSource(`/api/agents/${agentId}/stream`)
  }

  const res = await fetch(`/api/stream-token?agentId=${encodeURIComponent(agentId)}`, {
    cache: "no-store",
  })
  if (!res.ok) throw new Error(`stream-token failed: ${res.status}`)
  const { token } = (await res.json()) as { token: string }

  const base = STREAM_BASE.replace(/\/$/, "")
  return new EventSource(
    `${base}/v1/stream/agent/${encodeURIComponent(agentId)}?token=${encodeURIComponent(token)}`,
  )
}
