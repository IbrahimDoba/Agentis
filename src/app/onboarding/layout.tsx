import { getTenantBranding } from "@/lib/tenant"
import { BrandProvider } from "@/components/BrandProvider"

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
