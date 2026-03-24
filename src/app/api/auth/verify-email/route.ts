import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { sendWelcomeEmail, sendNewSignupNotification } from "@/lib/email"

export async function POST(req: NextRequest) {
  try {
    const { email, code } = await req.json()

    if (!email || !code) {
      return NextResponse.json({ error: "Missing email or code" }, { status: 400 })
    }

    const user = await db.user.findUnique({ where: { email } })

    if (!user) {
      return NextResponse.json({ error: "Invalid verification code" }, { status: 400 })
    }

    if (user.emailVerified) {
      return NextResponse.json({ error: "Email already verified" }, { status: 400 })
    }

    if (!user.verificationCode || user.verificationCode !== code) {
      return NextResponse.json({ error: "Invalid verification code" }, { status: 400 })
    }

    if (!user.verificationCodeExpiry || user.verificationCodeExpiry < new Date()) {
      return NextResponse.json({ error: "Verification code has expired. Please request a new one." }, { status: 400 })
    }

    await db.user.update({
      where: { email },
      data: {
        emailVerified: true,
        status: "APPROVED",
        verificationCode: null,
        verificationCodeExpiry: null,
      },
    })

    // Fire welcome emails after verified
    Promise.all([
      sendWelcomeEmail({ name: user.name, email: user.email }),
      sendNewSignupNotification({ name: user.name, email: user.email, businessName: user.businessName }),
    ]).catch((err) => console.error("[VERIFY] email error:", err))

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("[POST /api/auth/verify-email]", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

// Resend code
export async function PUT(req: NextRequest) {
  try {
    const { email } = await req.json()
    if (!email) return NextResponse.json({ error: "Missing email" }, { status: 400 })

    const user = await db.user.findUnique({ where: { email } })
    if (!user || user.emailVerified) {
      return NextResponse.json({ error: "Cannot resend code" }, { status: 400 })
    }

    const code = Math.floor(1000 + Math.random() * 9000).toString()
    const expiry = new Date(Date.now() + 10 * 60 * 1000)

    await db.user.update({
      where: { email },
      data: { verificationCode: code, verificationCodeExpiry: expiry },
    })

    const { sendVerificationCode } = await import("@/lib/email")
    await sendVerificationCode({ name: user.name, email, code })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("[PUT /api/auth/verify-email]", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
