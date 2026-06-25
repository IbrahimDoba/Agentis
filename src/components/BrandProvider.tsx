"use client"

import { createContext, useContext } from "react"
import { LogoIcon } from "@/components/landing/Logo"
import type { Branding } from "@/lib/tenant"

// Co-branding context. Seeded by a server layout (which resolves the tenant
// from the Host header) and consumed by client components on auth pages.

const PLATFORM_FALLBACK: Branding = {
  resellerId: "platform",
  isPlatform: true,
  appName: "D-Zero AI",
  logoUrl: null,
  primaryColor: null,
  supportEmail: "support@dailzero.com",
}

const BrandContext = createContext<Branding>(PLATFORM_FALLBACK)

export function BrandProvider({ branding, children }: { branding: Branding; children: React.ReactNode }) {
  return <BrandContext.Provider value={branding}>{children}</BrandContext.Provider>
}

export function useBrand(): Branding {
  return useContext(BrandContext)
}

/** Logo + app name for the current tenant (custom logo image if provided). */
export function BrandWordmark({ size = 32 }: { size?: number }) {
  const brand = useBrand()
  return (
    <>
      {brand.logoUrl
        ? <img src={brand.logoUrl} alt={brand.appName} style={{ height: size, width: "auto", objectFit: "contain" }} />
        : <LogoIcon size={size} />}
      {brand.appName}
    </>
  )
}

/** "Powered by Dailzero" — only shown on reseller tenants. */
export function PoweredByDailzero() {
  const brand = useBrand()
  if (brand.isPlatform) return null
  return (
    <div style={{ marginTop: 18, fontSize: 12, color: "var(--text-secondary, #71717a)", textAlign: "center" }}>
      Powered by Dailzero
    </div>
  )
}
