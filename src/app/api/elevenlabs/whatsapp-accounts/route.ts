import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { listWhatsAppAccounts } from "@/lib/elevenlabs"

export async function GET() {
  const session = await auth()
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const accounts = await listWhatsAppAccounts()
    return NextResponse.json({ accounts })
  } catch (err) {
    console.error("[GET /api/elevenlabs/whatsapp-accounts]", err)
    return NextResponse.json({ error: "Failed to fetch WhatsApp accounts" }, { status: 500 })
  }
}
