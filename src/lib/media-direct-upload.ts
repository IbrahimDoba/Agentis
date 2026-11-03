import { NextResponse } from "next/server"

const ORCHESTRATOR_URL = process.env.ORCHESTRATOR_URL || "http://localhost:4100"
const ORCHESTRATOR_API_KEY = process.env.ORCHESTRATOR_API_KEY

// Only the orchestrator's 400s are written for the user; anything else stays in the log.
export async function forwardToOrchestrator(path: string, body: unknown, tag: string): Promise<NextResponse> {
  const res = await fetch(`${ORCHESTRATOR_URL}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${ORCHESTRATOR_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  const data = await res.json().catch(() => null)
  if (res.ok) return NextResponse.json(data)
  console.error(tag, { status: res.status, error: data?.error })
  if (res.status === 400) return NextResponse.json({ error: data?.error ?? "Upload failed" }, { status: 400 })
  return NextResponse.json({ error: "Failed to upload media" }, { status: 500 })
}
