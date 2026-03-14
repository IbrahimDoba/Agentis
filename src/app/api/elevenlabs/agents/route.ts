import { auth } from "@/lib/auth"
import { NextResponse } from "next/server"

export async function GET() {
  const session = await auth()
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const apiKey = process.env.ELEVENLABS_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: "ElevenLabs API key not configured" }, { status: 500 })
  }

  const res = await fetch("https://api.elevenlabs.io/v1/convai/agents?page_size=100", {
    headers: { "xi-api-key": apiKey },
    next: { revalidate: 60 },
  })

  if (!res.ok) {
    const text = await res.text()
    return NextResponse.json({ error: `ElevenLabs error: ${text}` }, { status: res.status })
  }

  const data = await res.json()
  return NextResponse.json(data)
}
