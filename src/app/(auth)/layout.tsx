import type { Metadata } from "next"
import { getTenantBranding, brandingIcons } from "@/lib/tenant"
import { BrandProvider } from "@/components/BrandProvider"
import { AuthShowcase } from "@/components/auth/AuthShowcase"
import split from "@/components/auth/AuthShowcase.module.css"

// Auth pages are served on the tenant's own domain, so they carry the tenant's
// brand: app name in the title, logo/name in the form, accent colour, and
// branded social-share tags (so a shared reseller link doesn't preview "D-Zero AI").
export async function generateMetadata(): Promise<Metadata> {
  const brand = await getTenantBranding()
  return {
    title: `Sign in · ${brand.appName}`,
    icons: brandingIcons(brand),
    openGraph: { title: brand.appName, siteName: brand.appName },
    twitter: { title: brand.appName },
  }
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

  // The showcase is Dailzero's own artwork, so reseller domains keep the plain
  // centred form with their brand.
  if (branding.isPlatform) {
    return (
      <BrandProvider branding={branding}>
        <div className={split.split}>
          <AuthShowcase />
          <div className={split.form}>{children}</div>
        </div>
      </BrandProvider>
    )
  }

  return (
    <BrandProvider branding={branding}>
      <div style={style}>{children}</div>
    </BrandProvider>
  )
}
