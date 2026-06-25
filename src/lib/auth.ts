import NextAuth from "next-auth"
import Credentials from "next-auth/providers/credentials"
import Google from "next-auth/providers/google"
import bcrypt from "bcryptjs"
import { db } from "@/lib/db"
import { loginSchema } from "@/lib/validations"
import { authConfig } from "@/lib/auth.config"
import { sendVerificationCode } from "@/lib/email"
import { resolveResellerId, PLATFORM_RESELLER_ID } from "@/lib/tenant"

type AppAuthUser = {
  id: string
  role?: string
  status?: string
  businessName?: string
  resellerId?: string
  emailVerified?: boolean
}

function generateCode(): string {
  return Math.floor(1000 + Math.random() * 9000).toString()
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
        domain: { label: "Domain", type: "text" },
      },
      async authorize(credentials) {
        const parsed = loginSchema.safeParse(credentials)
        if (!parsed.success) return null

        // Resolve the tenant from the host the login form passed, then look the
        // user up per-tenant — the same email can exist on multiple tenants.
        const resellerId = await resolveResellerId(parsed.data.domain)
        const user = await db.user.findUnique({
          where: { resellerId_email: { resellerId, email: parsed.data.email } },
        })
        if (!user || !user.passwordHash) return null

        const valid = await bcrypt.compare(parsed.data.password, user.passwordHash)
        if (!valid) return null

        if (user.status === "REJECTED") return null
        if (!user.emailVerified) return null

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          status: user.status,
          businessName: user.businessName,
          resellerId: user.resellerId,
        }
      },
    }),
  ],
  callbacks: {
    ...authConfig.callbacks,
    async signIn({ user, account }) {
      // Only intercept Google sign-ins
      if (account?.provider !== "google") return true

      const email = user.email
      if (!email) return false

      // Google sign-in is offered only on the root (Dailzero) domain in v1, so
      // it always belongs to the platform tenant. Reseller sites are
      // email/password only.
      const resellerId = PLATFORM_RESELLER_ID
      const existing = await db.user.findUnique({
        where: { resellerId_email: { resellerId, email } },
      })

      if (existing) {
        if (existing.status === "REJECTED") return "/login?error=rejected"
        if (!existing.emailVerified) {
          const code = generateCode()
          const expiry = new Date(Date.now() + 10 * 60 * 1000)
          await db.user.update({
            where: { resellerId_email: { resellerId, email } },
            data: { verificationCode: code, verificationCodeExpiry: expiry },
          })
          sendVerificationCode({ name: existing.name, email, code }).catch(
            (err) => console.error("[GOOGLE SIGNIN] resend code error:", err)
          )
          return `/verify-email?email=${encodeURIComponent(email)}&provider=google`
        }

        // Inject DB fields into the user object so JWT callback can read them
        const appUser = user as typeof user & AppAuthUser
        appUser.id = existing.id
        appUser.role = existing.role
        appUser.status = existing.status
        appUser.businessName = existing.businessName
        appUser.resellerId = existing.resellerId
        appUser.emailVerified = existing.emailVerified
        return true
      }

      const code = generateCode()
      const expiry = new Date(Date.now() + 10 * 60 * 1000)

      // New Google user still goes through our OTP verification step.
      const newUser = await db.user.create({
        data: {
          name: user.name ?? email.split("@")[0],
          email,
          businessName: user.name ?? email.split("@")[0],
          resellerId,
          emailVerified: false,
          verificationCode: code,
          verificationCodeExpiry: expiry,
          status: "PENDING",
          passwordHash: null,
        },
      })

      sendVerificationCode({ name: newUser.name, email, code }).catch(
        (err) => console.error("[GOOGLE SIGNIN] send code error:", err)
      )

      return `/verify-email?email=${encodeURIComponent(email)}&provider=google`
    },
  },
})
