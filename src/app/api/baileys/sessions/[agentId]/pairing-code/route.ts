import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"

export async function POST(req: Request, { params }: { params: Promise<{ agentId: string }> }) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { agentId } = await params
  const { phoneNumber } = await req.json()
  if (!phoneNumber) return NextResponse.json({ error: "phoneNumber required" }, { status: 400 })

  const workerUrl = process.env.WORKER_URL ?? "http://localhost:4000"
  const apiKey = process.env.WORKER_API_KEY ?? ""

  const res = await fetch(`${workerUrl}/v1/sessions/${agentId}/pairing-code`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ phoneNumber }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    return NextResponse.json({ error: (err as Record<string, string>).message ?? "Worker error" }, { status: res.status })
  }

  return NextResponse.json(await res.json())
}
