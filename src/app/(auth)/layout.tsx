import type { Metadata } from "next"
import { getTenantBranding } from "@/lib/tenant"
import { BrandProvider } from "@/components/BrandProvider"

// Auth pages are served on the tenant's own domain, so they carry the tenant's
// brand: app name in the title, logo/name in the form, accent colour, and a
// "powered by Dailzero" line (reseller tenants only).
export async function generateMetadata(): Promise<Metadata> {
  const brand = await getTenantBranding()
  return { title: `Sign in · ${brand.appName}` }
}

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const branding = await getTenantBranding()

  const style: React.CSSProperties = {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "var(--bg-primary)",
    padding: "1rem",
  }
  // Override the accent so buttons/links pick up the reseller's colour.
  if (branding.primaryColor) {
    ;(style as Record<string, string>)["--accent"] = branding.primaryColor
  }

  return (
    <BrandProvider branding={branding}>
      <div style={style}>{children}</div>
    </BrandProvider>
  )
}
