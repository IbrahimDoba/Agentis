import type { Metadata } from "next"
import { redirect } from "next/navigation"
import Link from "next/link"
import { auth } from "@/lib/auth"
import { getTenant, getTenantBranding, brandingIcons } from "@/lib/tenant"

// Tenant-aware tab title + favicon for the reseller admin console.
export async function generateMetadata(): Promise<Metadata> {
  const brand = await getTenantBranding()
  return {
    title: `${brand.appName} · Admin`,
    icons: brandingIcons(brand),
  }
}

// Reseller admin console. A standalone surface (not the customer dashboard, not
// the Dailzero super-admin). Guarded here AND by the auth.config `authorized`
// rule — RESELLER_ADMIN (her own tenant) or the super-admin only.
export default async function ResellerLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  if (!session) redirect("/login")
  const role = session.user.role
  if (role !== "RESELLER_ADMIN" && role !== "ADMIN") redirect("/dashboard")

  const tenant = await getTenant()

  const navLink: React.CSSProperties = {
    fontSize: 14, fontWeight: 600, color: "var(--text-primary, #18181b)",
    textDecoration: "none", padding: "6px 10px", borderRadius: 8,
  }

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg-primary, #fafafa)" }}>
      <header style={{
        display: "flex", alignItems: "center", gap: 18, padding: "14px 24px",
        borderBottom: "1px solid var(--border, #e4e4e7)", background: "var(--bg-secondary, #fff)",
        position: "sticky", top: 0, zIndex: 10, flexWrap: "wrap",
      }}>
        <span style={{ fontSize: 16, fontWeight: 800 }}>{tenant.appName} <span style={{ color: "var(--text-secondary, #71717a)", fontWeight: 600 }}>· Admin</span></span>
        <nav style={{ display: "flex", gap: 4, marginLeft: 8 }}>
          <Link href="/reseller" style={navLink}>Overview</Link>
          <Link href="/reseller/users" style={navLink}>Customers</Link>
          <Link href="/reseller/plans" style={navLink}>Plans</Link>
          <Link href="/reseller/settings" style={navLink}>Settings</Link>
        </nav>
        <div style={{ marginLeft: "auto", display: "flex", gap: 12, alignItems: "center" }}>
          <Link href="/dashboard" style={{ ...navLink, color: "var(--text-secondary, #71717a)" }}>← My dashboard</Link>
        </div>
      </header>
      <main style={{ maxWidth: 1080, margin: "0 auto", padding: "28px 24px 64px" }}>{children}</main>
    </div>
  )
}
