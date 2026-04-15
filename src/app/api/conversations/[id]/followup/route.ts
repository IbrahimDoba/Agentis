import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import OpenAI from "openai"

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id: conversationId } = await params

  try {
    const body = await req.json()
    const { templateId, agentId } = body

    if (!templateId || !agentId) {
      return NextResponse.json({ error: "templateId and agentId are required" }, { status: 400 })
    }

    // Verify agent ownership
    const agent = await db.agent.findUnique({ where: { id: agentId } })
    if (!agent) return NextResponse.json({ error: "Agent not found" }, { status: 404 })

    const isOwner = agent.userId === session.user.id
    const isAdmin = session.user.role === "ADMIN"
    if (!isOwner && !isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

    // Fetch template (must belong to agentId)
    const template = await db.messageTemplate.findFirst({
      where: { id: templateId, agentId },
    })
    if (!template) return NextResponse.json({ error: "Template not found" }, { status: 404 })

    // Fetch conversation log + customer name in parallel
    const [log, customer] = await Promise.all([
      db.conversationLog.findUnique({ where: { conversationId } }),
      db.customer.findFirst({
        where: { conversationLogs: { some: { conversationId } } },
        select: { name: true },
      }),
    ])
    if (!log) return NextResponse.json({ error: "Conversation not found" }, { status: 404 })

    // Build transcript excerpt (last 10 messages)
    const transcript = (log.transcript as { role: string; message?: string | null }[]) ?? []
    const transcriptExcerpt = transcript
      .slice(-10)
      .filter((m) => m.message?.trim())
      .map((m) => `${m.role === "user" ? "Customer" : "Agent"}: ${m.message}`)
      .join("\n")

    const customerName = customer?.name ?? null
    const conversationContext = log.summary ?? transcriptExcerpt ?? "Customer contacted us"

    // Get current time of day for greeting
    const hour = new Date().getHours()
    const timeGreeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening"

    const prompt = `You are ghostwriting a WhatsApp follow-up message for a business owner to send to a customer. It must sound like a real person wrote it — warm, direct, human. Not a bot, not a template.

---
TEMPLATE INSTRUCTION FROM THE BUSINESS OWNER:
${template.content}
---
WHAT HAPPENED IN THE CONVERSATION:
${conversationContext}
---
CUSTOMER'S FIRST NAME: ${customerName ?? "unknown (don't use a name if you don't know it)"}
TIME OF DAY: ${timeGreeting}
---

Write the message following this exact structure:
1. Greeting line — use the time of day and customer's first name if known (e.g. "Good afternoon Akin,")
2. Introduction — who the sender is, exactly as described in the template instruction
3. The follow-up — reference something specific from the conversation (what they were interested in, their business type, their question, etc.)
4. Call to action — end with what the template instruction says to do next

Rules:
- 3–5 sentences total. Short sentences.
- Sound like a real person texting, not an email. No "I hope this message finds you well."
- Use contractions naturally (I'm, we're, you've, I'd).
- Do NOT add sign-offs like "Best regards", "Warm regards", "Thanks, Team" etc.
- Do NOT add emojis unless the template instruction explicitly asks for them.
- Return only the message text. No labels, no quotes, nothing else.`

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 300,
    })

    const message = completion.choices[0]?.message?.content?.trim() ?? ""
    return NextResponse.json({ message })
  } catch (error) {
    console.error("[POST /api/conversations/:id/followup]", error)
    return NextResponse.json({ error: "Failed to generate follow-up" }, { status: 500 })
  }
}
