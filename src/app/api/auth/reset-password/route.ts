import { NextRequest, NextResponse } from "next/server"
import bcrypt from "bcryptjs"
import { db } from "@/lib/db"

export async function POST(req: NextRequest) {
  try {
    const { token, password } = await req.json()

    if (!token || !password) {
      return NextResponse.json({ error: "Token and password are required" }, { status: 400 })
    }

    if (password.length < 8) {
      return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 })
    }

    const user = await db.user.findUnique({ where: { resetToken: token } })

    if (!user || !user.resetTokenExpiry) {
      return NextResponse.json({ error: "Invalid or expired reset link" }, { status: 400 })
    }

    if (user.resetTokenExpiry < new Date()) {
      return NextResponse.json({ error: "Reset link has expired. Please request a new one." }, { status: 400 })
    }

    const passwordHash = await bcrypt.hash(password, 12)

    await db.user.update({
      where: { id: user.id },
      data: { passwordHash, resetToken: null, resetTokenExpiry: null },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("[POST /api/auth/reset-password]", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
