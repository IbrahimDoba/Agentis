import { NextRequest, NextResponse } from "next/server"
import crypto from "crypto"
import { db } from "@/lib/db"
import { sendPasswordResetEmail } from "@/lib/email"

export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json()

    if (!email) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 })
    }

    const user = await db.user.findUnique({ where: { email } })

    // Always return success to avoid revealing whether an email exists
    if (!user) {
      return NextResponse.json({ success: true })
    }

    const token = crypto.randomBytes(32).toString("hex")
    const expiry = new Date(Date.now() + 60 * 60 * 1000) // 1 hour

    await db.user.update({
      where: { id: user.id },
      data: { resetToken: token, resetTokenExpiry: expiry },
    })

    const resetLink = `${process.env.NEXTAUTH_URL?.startsWith("http://localhost") ? "http://localhost:3000" : (process.env.NEXTAUTH_URL ?? "https://www.dailzero.com")}/reset-password?token=${token}`

    await sendPasswordResetEmail({ name: user.name, email: user.email, resetLink })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("[POST /api/auth/forgot-password]", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
