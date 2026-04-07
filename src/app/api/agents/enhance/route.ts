import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { enhanceAgentInstructions } from "@/lib/openai"

export async function POST(req: NextRequest) {
  try {
    const session = await auth()

    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await req.json()
    const { businessName, systemPrompt } = body

    const instructions = await enhanceAgentInstructions({
      businessName: businessName || session.user.businessName || "My Business",
      systemPrompt,
    })

    return NextResponse.json({ instructions })
  } catch (error) {
    console.error("[POST /api/agents/enhance]", error)
    return NextResponse.json({ error: "Failed to generate instructions" }, { status: 500 })
  }
}
