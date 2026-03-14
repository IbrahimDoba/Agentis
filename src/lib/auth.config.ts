import type { NextAuthConfig } from "next-auth"

// Edge-compatible auth config (no DB imports)
export const authConfig: NextAuthConfig = {
  providers: [], // Credentials provider added in auth.ts (Node.js only)
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user
      const pathname = nextUrl.pathname

      if (pathname.startsWith("/dashboard")) {
        if (!isLoggedIn) return false
        const status = auth?.user?.status
        if (status === "REJECTED") return Response.redirect(new URL("/login?error=rejected", nextUrl))
        if (status === "PENDING" && pathname !== "/dashboard/pending") {
          return Response.redirect(new URL("/dashboard/pending", nextUrl))
        }
        return true
      }

      if (pathname.startsWith("/admin")) {
        if (!isLoggedIn) return false
        if (auth?.user?.role !== "ADMIN") return Response.redirect(new URL("/dashboard", nextUrl))
        return true
      }

      return true
    },
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id
        token.role = (user as any).role
        token.status = (user as any).status
        token.businessName = (user as any).businessName
      }
      return token
    },
    async session({ session, token }) {
      if (token) {
        session.user.id = token.id as string
        session.user.role = token.role as string
        session.user.status = token.status as string
        session.user.businessName = token.businessName as string
      }
      return session
    },
  },
  pages: {
    signIn: "/login",
    error: "/login",
  },
  session: { strategy: "jwt" },
}
