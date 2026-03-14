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
    const { businessName, businessDescription, productsServices, faqs, operatingHours, responseGuidelines } = body

    if (!businessDescription || businessDescription.length < 20) {
      return NextResponse.json(
        { error: "Business description is required (min 20 chars)" },
        { status: 400 }
      )
    }

    const instructions = await enhanceAgentInstructions({
      businessName: businessName || "My Business",
      businessDescription,
      productsServices: productsServices || "",
      faqs: faqs || "",
      operatingHours: operatingHours || "",
      responseGuidelines,
    })

    return NextResponse.json({ instructions })
  } catch (error) {
    console.error("[POST /api/agents/enhance]", error)
    return NextResponse.json({ error: "Failed to enhance instructions" }, { status: 500 })
  }
}
