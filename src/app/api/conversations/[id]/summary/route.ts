import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { getConversation } from "@/lib/elevenlabs"
import { NextResponse } from "next/server"
import OpenAI from "openai"

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params

  const agent = await db.agent.findFirst({
    where: { userId: session.user.id },
  })

  if (!agent?.elevenlabsAgentId) {
    return NextResponse.json({ error: "No active agent" }, { status: 403 })
  }

  try {
    const conv = await getConversation(id)
    const transcript: { role: string; message: string }[] = conv.transcript ?? []

    if (transcript.length === 0) {
      return NextResponse.json({ summary: "No messages to summarise." })
    }

    const formatted = transcript
      .map((m) => `${m.role === "user" ? "Customer" : "Agent"}: ${m.message}`)
      .join("\n")

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "You are a helpful assistant that summarises WhatsApp customer service conversations. Be concise (2-4 sentences). Focus on: what the customer wanted, how the agent helped, and the outcome.",
        },
        {
          role: "user",
          content: `Summarise this conversation:\n\n${formatted}`,
        },
      ],
      max_tokens: 200,
    })

    const summary = completion.choices[0]?.message?.content?.trim() ?? "Could not generate summary."
    return NextResponse.json({ summary })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: "Failed to generate summary" }, { status: 500 })
  }
}
