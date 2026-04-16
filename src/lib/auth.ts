import NextAuth from "next-auth"
import Credentials from "next-auth/providers/credentials"
import Google from "next-auth/providers/google"
import bcrypt from "bcryptjs"
import { db } from "@/lib/db"
import { loginSchema } from "@/lib/validations"
import { authConfig } from "@/lib/auth.config"

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
        // Account exists (credentials or previous Google) — allow sign in
        if (existing.status === "REJECTED") return "/login?error=rejected"

        // Inject DB fields into the user object so JWT callback can read them
        user.id = existing.id
        ;(user as any).role = existing.role
        ;(user as any).status = existing.status
        ;(user as any).businessName = existing.businessName
        return true
      }

      // New user — create account with PENDING status
      const newUser = await db.user.create({
        data: {
          name: user.name ?? email.split("@")[0],
          email,
          businessName: user.name ?? email.split("@")[0],
          emailVerified: true,  // Google already verified it
          status: "PENDING",
          passwordHash: null,
        },
      })

      user.id = newUser.id
      ;(user as any).role = newUser.role
      ;(user as any).status = newUser.status
      ;(user as any).businessName = newUser.businessName
      return true
    },
  },
})
