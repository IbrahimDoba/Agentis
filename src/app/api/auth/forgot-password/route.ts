import { NextRequest, NextResponse } from "next/server"
import crypto from "crypto"
import { db } from "@/lib/db"
import { sendPasswordResetEmail } from "@/lib/email"
import { findResellerByHost, emailBrandOf, PLATFORM_RESELLER_ID } from "@/lib/tenant"

export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json()

    if (!email) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 })
    }

    // Resolve the tenant from the host so a reseller user is looked up on her
    // own site (the same email can exist on Dailzero and a reseller tenant).
    const host = req.headers.get("host")
    const reseller = await findResellerByHost(host)
    const resellerId = reseller?.id ?? PLATFORM_RESELLER_ID
    const user = await db.user.findUnique({
      where: { resellerId_email: { resellerId, email } },
    })

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

    // Keep the reset link on the tenant's own domain (so a reseller user stays
    // on her branded site), falling back to NEXTAUTH_URL.
    const base = host
      ? `${host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https"}://${host}`
      : (process.env.NEXTAUTH_URL ?? "https://www.dailzero.com")
    const resetLink = `${base}/reset-password?token=${token}`

    await sendPasswordResetEmail({ name: user.name, email: user.email, resetLink }, emailBrandOf(reseller))

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("[POST /api/auth/forgot-password]", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
