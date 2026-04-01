import { NextRequest, NextResponse } from "next/server"
import bcrypt from "bcryptjs"
import { db } from "@/lib/db"
import { signupSchema } from "@/lib/validations"
import { sendVerificationCode } from "@/lib/email"

function generateCode(): string {
  return Math.floor(1000 + Math.random() * 9000).toString()
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const parsed = signupSchema.safeParse(body)

    if (!parsed.success) {
      const errors: Record<string, string> = {}
      parsed.error.issues.forEach((err) => {
        const field = err.path[0] as string
        errors[field] = err.message
      })
      return NextResponse.json({ errors }, { status: 400 })
    }

    const { name, email, businessName, phone, password } = parsed.data

    const existing = await db.user.findUnique({ where: { email } })
    if (existing) {
      // If they exist but haven't verified yet, resend the code
      if (!existing.emailVerified) {
        const code = generateCode()
        const expiry = new Date(Date.now() + 10 * 60 * 1000) // 10 min
        await db.user.update({
          where: { email },
          data: { verificationCode: code, verificationCodeExpiry: expiry },
        })
        sendVerificationCode({ name: existing.name, email, code }).catch(
          (err) => console.error("[SIGNUP] resend code error:", err)
        )
        return NextResponse.json({ email }, { status: 200 })
      }
      return NextResponse.json(
        { error: "An account with this email already exists" },
        { status: 409 }
      )
    }

    const passwordHash = await bcrypt.hash(password, 12)
    const code = generateCode()
    const expiry = new Date(Date.now() + 10 * 60 * 1000)

    await db.user.create({
      data: {
        name,
        email,
        businessName,
        phone: phone || null,
        passwordHash,
        emailVerified: false,
        verificationCode: code,
        verificationCodeExpiry: expiry,
      },
    })

    sendVerificationCode({ name, email, code }).catch(
      (err) => console.error("[SIGNUP] send code error:", err)
    )

    return NextResponse.json({ email }, { status: 201 })
  } catch (error) {
    console.error("[SIGNUP]", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
