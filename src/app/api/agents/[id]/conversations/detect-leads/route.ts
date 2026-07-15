import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import OpenAI from "openai"
import { batchByTokenBudget, type LeadConvEntry } from "@/lib/detectLeadsBatching"

// Batches run sequentially in small parallel groups; allow more headroom than
// the default so a large account (thousands of conversations) can't hit the
// serverless timeout mid-scan.
export const maxDuration = 60

interface Params { params: Promise<{ id: string }> }

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

interface ConvInput {
  conversationId: string
  callerNumber?: string
  summary?: string
  title?: string
}

// Keep one conversation's snippet short so a single long message can't bloat a
// batch; the model only needs the gist to judge buying intent.
const MAX_SUMMARY_CHARS = 400
// Per-request content budget, far under gpt-4o-mini's 128k context (leaves room
// for the system prompt + the JSON-array response).
const BATCH_TOKEN_BUDGET = 30_000
// How many batches to send to OpenAI at once.
const BATCH_CONCURRENCY = 4

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

  // Split into token-budgeted batches so a large account never overflows the
  // model's 128k context (the prod bug: one request hit 195k tokens → 400).
  const entries: LeadConvEntry[] = toCheck.map((c) => {
    const snippet = (c.summary || c.title || "No summary").slice(0, MAX_SUMMARY_CHARS)
    return { conversationId: c.conversationId, text: `ID: ${c.conversationId}\n   Summary: ${snippet}` }
  })
  const batches = batchByTokenBudget(entries, BATCH_TOKEN_BUDGET)

  const validIds = new Set(toCheck.map((c) => c.conversationId))
  const detectedIds = new Set<string>()

  const runBatch = async (batch: LeadConvEntry[]) => {
    const convList = batch.map((e, i) => `${i + 1}. ${e.text}`).join("\n\n")
    try {
      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        temperature: 0,
        max_tokens: 2000,
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
      const raw = completion.choices[0].message.content ?? "[]"
      const match = raw.match(/\[[\s\S]*\]/)
      const ids: unknown = match ? JSON.parse(match[0]) : []
      if (Array.isArray(ids)) {
        for (const id of ids) if (typeof id === "string" && validIds.has(id)) detectedIds.add(id)
      }
    } catch {
      // A failed/oversized batch must not sink the whole scan — skip it.
    }
  }

  // Process batches in small parallel groups (bounded, to respect rate limits).
  for (let i = 0; i < batches.length; i += BATCH_CONCURRENCY) {
    await Promise.all(batches.slice(i, i + BATCH_CONCURRENCY).map(runBatch))
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
