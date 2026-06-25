import type { NextAuthConfig } from "next-auth"

type AppCallbackUser = {
  id?: string
  role?: string
  status?: string
  businessName?: string
  resellerId?: string
}

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
        if (status === "SUSPENDED" && pathname !== "/dashboard/suspended") {
          return Response.redirect(new URL("/dashboard/suspended", nextUrl))
        }
        if (status === "PENDING" && pathname !== "/dashboard/pending") {
          return Response.redirect(new URL("/dashboard/pending", nextUrl))
        }
        return true
      }

      // Super-admin console (all tenants). Root tenant ADMIN only.
      if (pathname.startsWith("/admin")) {
        if (!isLoggedIn) return false
        if (auth?.user?.role !== "ADMIN") return Response.redirect(new URL("/dashboard", nextUrl))
        return true
      }

      // Reseller admin console (her own tenant only). RESELLER_ADMIN or the
      // super-admin. (Pages also guard themselves — there is no middleware yet.)
      if (pathname.startsWith("/reseller")) {
        if (!isLoggedIn) return false
        const role = auth?.user?.role
        if (role !== "RESELLER_ADMIN" && role !== "ADMIN") {
          return Response.redirect(new URL("/dashboard", nextUrl))
        }
        return true
      }

      return true
    },
    async jwt({ token, user }) {
      if (user) {
        const appUser = user as typeof user & AppCallbackUser
        token.id = appUser.id
        token.role = appUser.role
        token.status = appUser.status
        token.businessName = appUser.businessName
        token.resellerId = appUser.resellerId
      }
      return token
    },
    async session({ session, token }) {
      if (token) {
        session.user.id = token.id as string
        session.user.role = token.role as string
        session.user.status = token.status as string
        session.user.businessName = token.businessName as string
        session.user.resellerId = (token.resellerId as string) ?? "platform"
      }
      return session
    },
  },
  pages: {
    signIn: "/login",
    error: "/login",
  },
  session: { strategy: "jwt" },
  // Required for multi-domain: trust the incoming Host header so auth works on
  // each reseller's own domain (not just NEXTAUTH_URL). Safe behind Vercel,
  // which sets the host. Without this, login on a reseller domain can throw
  // UntrustedHost in production.
  trustHost: true,
}
