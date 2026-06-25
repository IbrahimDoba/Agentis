import { headers } from "next/headers"
import { cache } from "react"
import { db } from "@/lib/db"

// Multi-tenant resolution. A request's Host header decides which reseller
// (white-label tenant) it belongs to. The root tenant (Dailzero) is a fixed
// row id "platform"; any host that doesn't match a reseller falls back to it,
// so there is no special-casing of the root.

export const PLATFORM_RESELLER_ID = "platform"

// Inferred from the generated client so we don't depend on the model export name.
export type Reseller = NonNullable<Awaited<ReturnType<typeof db.reseller.findFirst>>>

export type Branding = {
  resellerId: string
  isPlatform: boolean
  appName: string
  logoUrl: string | null
  primaryColor: string | null
  supportEmail: string
}

const PLATFORM_APP_NAME = "D-Zero AI"
const PLATFORM_SUPPORT_EMAIL = "support@dailzero.com"

function normalizeHost(host: string | null | undefined): string {
  if (!host) return ""
  // Drop port, lowercase. (www.* is matched explicitly via domainAliases.)
  return host.split(":")[0].trim().toLowerCase()
}

/**
 * Look up an ACTIVE reseller by host. Returns null when nothing matches (the
 * caller decides whether to fall back to platform). Plain async — NO React
 * cache — so it is safe to call from NextAuth callbacks (which run outside a
 * React request scope).
 */
export async function findResellerByHost(host: string | null | undefined): Promise<Reseller | null> {
  const h = normalizeHost(host)
  if (!h) return null
  return db.reseller.findFirst({
    where: {
      status: "active",
      OR: [{ domain: h }, { domainAliases: { has: h } }],
    },
  })
}

/** Resolve just the tenant id for a host, defaulting to the platform tenant. */
export async function resolveResellerId(host: string | null | undefined): Promise<string> {
  const match = await findResellerByHost(host)
  return match?.id ?? PLATFORM_RESELLER_ID
}

/** The root tenant row, with a defensive synthetic fallback if it's missing. */
export async function getPlatformReseller(): Promise<Reseller> {
  const platform = await db.reseller.findUnique({ where: { id: PLATFORM_RESELLER_ID } })
  if (platform) return platform
  return {
    id: PLATFORM_RESELLER_ID,
    name: "Dailzero",
    domain: "dailzero.com",
    domainAliases: [],
    appName: PLATFORM_APP_NAME,
    logoUrl: null,
    primaryColor: null,
    supportEmail: PLATFORM_SUPPORT_EMAIL,
    status: "active",
    creditPool: 0,
    creditPoolTotal: 0,
    adminUserId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as Reseller
}

/**
 * The current tenant for the incoming request (from the Host header). Cached
 * per request. Use this in server components, layouts, and route handlers.
 */
export const getTenant = cache(async (): Promise<Reseller> => {
  const hdrs = await headers()
  const match = await findResellerByHost(hdrs.get("host"))
  return match ?? getPlatformReseller()
})

export function getBranding(reseller: Reseller): Branding {
  return {
    resellerId: reseller.id,
    isPlatform: reseller.id === PLATFORM_RESELLER_ID,
    appName: reseller.appName || PLATFORM_APP_NAME,
    logoUrl: reseller.logoUrl,
    primaryColor: reseller.primaryColor,
    supportEmail: reseller.supportEmail || PLATFORM_SUPPORT_EMAIL,
  }
}

/** Branding for the current request's tenant. */
export const getTenantBranding = cache(async (): Promise<Branding> => {
  return getBranding(await getTenant())
})

/**
 * Email co-branding for a reseller. Returns `undefined` for the platform tenant
 * (so emails fall back to Dailzero defaults). The email `from` ADDRESS stays on
 * our verified domain regardless — only the display name + body are branded.
 */
export function emailBrandOf(reseller: Reseller | null | undefined): { appName: string; appUrl: string } | undefined {
  if (!reseller || reseller.id === PLATFORM_RESELLER_ID) return undefined
  return { appName: reseller.appName, appUrl: `https://${reseller.domain}` }
}
