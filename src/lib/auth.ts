import NextAuth from "next-auth"
import Credentials from "next-auth/providers/credentials"
import Google from "next-auth/providers/google"
import bcrypt from "bcryptjs"
import { db } from "@/lib/db"
import { loginSchema } from "@/lib/validations"
import { authConfig } from "@/lib/auth.config"
import { sendVerificationCode } from "@/lib/email"

type AppAuthUser = {
  id: string
  role?: string
  status?: string
  businessName?: string
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
      },
      async authorize(credentials) {
        const parsed = loginSchema.safeParse(credentials)
        if (!parsed.success) return null

        const user = await db.user.findUnique({
          where: { email: parsed.data.email },
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

      const existing = await db.user.findUnique({ where: { email } })

      if (existing) {
        if (existing.status === "REJECTED") return "/login?error=rejected"
        if (!existing.emailVerified) {
          const code = generateCode()
          const expiry = new Date(Date.now() + 10 * 60 * 1000)
          await db.user.update({
            where: { email },
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
