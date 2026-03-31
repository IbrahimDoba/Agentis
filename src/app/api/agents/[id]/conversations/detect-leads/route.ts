import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import OpenAI from "openai"

interface Params { params: Promise<{ id: string }> }

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

interface ConvInput {
  conversationId: string
  callerNumber?: string
  summary?: string
  title?: string
}

export async function POST(req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  const agent = await db.agent.findUnique({ where: { id }, select: { userId: true } })
  if (!agent || agent.userId !== session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const body = await req.json()
  const conversations: ConvInput[] = body.conversations ?? []

  if (conversations.length === 0) return NextResponse.json({ detected: [] })

  // Only check conversations not already leads
  const existingLeads = await db.lead.findMany({
    where: { userId: session.user.id, agentId: id },
    select: { conversationId: true },
  })
  const existingIds = new Set(existingLeads.map((l) => l.conversationId))
  const toCheck = conversations.filter((c) => !existingIds.has(c.conversationId))

  if (toCheck.length === 0) return NextResponse.json({ detected: [] })

  // Build prompt
  const convList = toCheck
    .map((c, i) => `${i + 1}. ID: ${c.conversationId}\n   Summary: ${c.summary || c.title || "No summary"}`)
    .join("\n\n")

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0,
    messages: [
      {
        role: "system",
        content: `You are analyzing customer service chat conversations to identify leads — conversations where a customer showed strong buying intent, asked about pricing, wanted to place an order, requested a callback, or was ready to make a purchase decision.

Return ONLY a JSON array of conversation IDs that are leads. Example: ["conv_abc123", "conv_xyz456"]
If none are leads, return [].`,
      },
      {
        role: "user",
        content: `Identify which of these conversations are leads:\n\n${convList}`,
      },
    ],
  })

  let detectedIds: string[] = []
  try {
    const raw = completion.choices[0].message.content ?? "[]"
    const match = raw.match(/\[[\s\S]*\]/)
    detectedIds = match ? JSON.parse(match[0]) : []
  } catch {
    detectedIds = []
  }

  // Create lead records for detected ones
  const detected: string[] = []
  for (const convId of detectedIds) {
    const conv = toCheck.find((c) => c.conversationId === convId)
    if (!conv) continue
    try {
      await db.lead.create({
        data: {
          id: Math.random().toString(36).slice(2, 12),
          conversationId: convId,
          agentId: id,
          userId: session.user.id,
          callerNumber: conv.callerNumber ?? null,
          summary: conv.summary ?? conv.title ?? null,
          aiDetected: true,
        },
      })
      detected.push(convId)
    } catch {
      // already exists — skip
    }
  }

  return NextResponse.json({ detected })
}
