import { NextRequest, NextResponse } from "next/server"
import bcrypt from "bcryptjs"
import { db } from "@/lib/db"
import { signupSchema } from "@/lib/validations"
import { sendWelcomeEmail, sendNewSignupNotification } from "@/lib/email"

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

    const { name, email, phone, businessName, password } = parsed.data

    // Check if email already exists
    const existing = await db.user.findUnique({ where: { email } })
    if (existing) {
      return NextResponse.json(
        { error: "An account with this email already exists" },
        { status: 409 }
      )
    }

    const passwordHash = await bcrypt.hash(password, 12)

    const user = await db.user.create({
      data: {
        name,
        email,
        phone,
        businessName,
        passwordHash,
      },
    })

    // Fire emails in background — don't block the response
    Promise.all([
      sendWelcomeEmail({ name: user.name, email: user.email }),
      sendNewSignupNotification({
        name: user.name,
        email: user.email,
        businessName: user.businessName,
        phone: user.phone,
      }),
    ]).catch((err) => console.error("[SIGNUP] email error:", err))

    return NextResponse.json(
      { id: user.id, name: user.name, email: user.email },
      { status: 201 }
    )
  } catch (error) {
    console.error("[SIGNUP]", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
