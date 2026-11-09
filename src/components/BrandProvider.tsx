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
  supportWhatsapp: null,
}

const BrandContext = createContext<Branding>(PLATFORM_FALLBACK)

export function BrandProvider({ branding, children }: { branding: Branding; children: React.ReactNode }) {
  return <BrandContext.Provider value={branding}>{children}</BrandContext.Provider>
}

export function useBrand(): Branding {
  return useContext(BrandContext)
}

// The platform's logo reads "Dailzero" while its product name (titles, emails,
// copy) is still "D-Zero AI". Resellers keep their own name.
const PLATFORM_WORDMARK = "Dailzero"

/** Logo + app name for the current tenant (custom logo image if provided). */
export function BrandWordmark({ size = 32 }: { size?: number }) {
  const brand = useBrand()
  const name = brand.isPlatform ? PLATFORM_WORDMARK : brand.appName
  return (
    <>
      {brand.logoUrl
        ? <img src={brand.logoUrl} alt={name} style={{ height: size, width: "auto", objectFit: "contain" }} />
        : <LogoIcon size={size} />}
      {name}
    </>
  )
}
