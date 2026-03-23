import { NextRequest, NextResponse } from "next/server"
import { sendDataDeletionRequest } from "@/lib/email"

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { fullName, email, phone, requestType, additionalInfo, ref } = body

    if (!fullName || !email || !requestType || !ref) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
    }

    await sendDataDeletionRequest({ fullName, email, phone, requestType, additionalInfo, ref })

    return NextResponse.json({ success: true }, { status: 200 })
  } catch (error) {
    console.error("[POST /api/data-deletion]", error)
    return NextResponse.json({ error: "Failed to submit request" }, { status: 500 })
  }
}
