import { NextRequest, NextResponse } from "next/server"
import bcrypt from "bcryptjs"
import { db } from "@/lib/db"
import { signupSchema } from "@/lib/validations"
import { sendVerificationCode } from "@/lib/email"
import { findResellerByHost, emailBrandOf, PLATFORM_RESELLER_ID } from "@/lib/tenant"

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
    const refCode = typeof body.refCode === "string" ? body.refCode.trim() : null

    // Which tenant is this signup for? Resolved from the host the request came
    // in on; unknown hosts (and Dailzero's own) resolve to the platform tenant.
    const reseller = await findResellerByHost(req.headers.get("host"))
    const resellerId = reseller?.id ?? PLATFORM_RESELLER_ID
    // The platform tenant ("Dailzero") is itself a Reseller row whose domain is
    // dailzero.com, so findResellerByHost returns it (non-null) for our own host.
    // Treat it as the platform — only a genuine white-label tenant is a reseller.
    const isPlatformTenant = resellerId === PLATFORM_RESELLER_ID
    const brand = emailBrandOf(reseller)

    const existing = await db.user.findUnique({
      where: { resellerId_email: { resellerId, email } },
    })
    if (existing) {
      // If they exist but haven't verified yet, resend the code
      if (!existing.emailVerified) {
        const code = generateCode()
        const expiry = new Date(Date.now() + 10 * 60 * 1000) // 10 min
        await db.user.update({
          where: { resellerId_email: { resellerId, email } },
          data: { verificationCode: code, verificationCodeExpiry: expiry },
        })
        sendVerificationCode({ name: existing.name, email, code }, brand).catch(
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

    const newUser = await db.user.create({
      data: {
        name,
        email,
        businessName,
        phone: phone || null,
        passwordHash,
        resellerId,
        // Reseller-tenant signups start on the 0-allowance "reseller" plan (no
        // free Dailzero credits) — they get credits only when their reseller
        // admin activates a plan from her pool. Platform signups default to free.
        plan: isPlatformTenant ? "free" : "reseller",
        emailVerified: false,
        verificationCode: code,
        verificationCodeExpiry: expiry,
      },
    })

    // Link referral if a valid ref code was provided
    if (refCode) {
      const referrer = await db.user.findUnique({
        where: { referralCode: refCode },
        select: { id: true },
      })
      if (referrer && referrer.id !== newUser.id) {
        await db.referral.create({
          data: {
            referrerId: referrer.id,
            referredId: newUser.id,
            code: refCode,
          },
        }).catch((err) => console.error("[SIGNUP] referral create error:", err))
      }
    }

    sendVerificationCode({ name, email, code }, brand).catch(
      (err) => console.error("[SIGNUP] send code error:", err)
    )

    return NextResponse.json({ email }, { status: 201 })
  } catch (error) {
    console.error("[SIGNUP]", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
