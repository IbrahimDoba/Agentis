import type { Metadata } from "next"
import { getTenantBranding, brandingIcons } from "@/lib/tenant"
import { BrandProvider } from "@/components/BrandProvider"

// Tenant-aware tab title + favicon so a reseller's customers see her brand.
export async function generateMetadata(): Promise<Metadata> {
  const brand = await getTenantBranding()
  return {
    title: `Get started · ${brand.appName}`,
    icons: brandingIcons(brand),
  }
}

// Seed the tenant brand for the onboarding flow so its client components can
// useBrand() (and pick up the reseller's accent colour).
export default async function OnboardingLayout({ children }: { children: React.ReactNode }) {
  const branding = await getTenantBranding()
  const accentStyle: React.CSSProperties = { display: "contents" }
  if (branding.primaryColor) (accentStyle as Record<string, string>)["--accent"] = branding.primaryColor
  return (
    <BrandProvider branding={branding}>
      <div style={accentStyle}>{children}</div>
    </BrandProvider>
  )
}
