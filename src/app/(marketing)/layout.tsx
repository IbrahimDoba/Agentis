import { getTenantBranding } from "@/lib/tenant"
import { BrandProvider } from "@/components/BrandProvider"

// Seed the tenant branding for the whole marketing section so the shared
// Navbar/Footer render the reseller's name + logo and hide Dailzero-only links
// on reseller domains. (Reading the Host header here opts these pages into
// dynamic rendering — the same trade-off the auth/dashboard layouts make.)
export default async function MarketingLayout({ children }: { children: React.ReactNode }) {
  const branding = await getTenantBranding()
  return <BrandProvider branding={branding}>{children}</BrandProvider>
}
