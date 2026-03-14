import { NextRequest, NextResponse } from "next/server"
import { demoSchema } from "@/lib/validations"
import { sendDemoRequest } from "@/lib/email"

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const parsed = demoSchema.safeParse(body)

    if (!parsed.success) {
      const errors: Record<string, string> = {}
      parsed.error.issues.forEach((err) => {
        const field = err.path[0] as string
        errors[field] = err.message
      })
      return NextResponse.json({ errors }, { status: 400 })
    }

    await sendDemoRequest(parsed.data)

    return NextResponse.json({ success: true }, { status: 201 })
  } catch (error) {
    console.error("[POST /api/demo]", error)
    return NextResponse.json({ error: "Failed to send demo request" }, { status: 500 })
  }
}
