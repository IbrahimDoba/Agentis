import { graphGet } from "./graph"

// Read-only Graph calls that exercise the `business_management` permission —
// which businesses this account administers, and which WhatsApp Business
// Accounts each one owns. Kept apart from management.ts (whatsapp_business_
// management) so each permission maps to exactly one panel in the screencast.

export interface OwnedWaba {
  id: string
  name: string
}

export interface BusinessPortfolioEntry {
  id: string
  name: string
  verificationStatus: string | null
  wabas: OwnedWaba[]
  // Non-null when the owned-WABA lookup failed for this business alone — a
  // business the token can see but lacks asset access to shouldn't blank the
  // whole panel mid-recording.
  wabaError: string | null
}

interface GraphList<T> {
  data?: T[]
}

async function getOwnedWabas(businessId: string): Promise<OwnedWaba[]> {
  const res = await graphGet<GraphList<{ id: string; name?: string }>>(
    `${businessId}/owned_whatsapp_business_accounts`,
    "id,name"
  )
  return (res.data ?? []).map((w) => ({ id: w.id, name: w.name ?? "—" }))
}

interface RawBusiness {
  id: string
  name: string
  verification_status?: string
}

// A system user token belongs to one business, so /me/businesses comes back
// empty for it — unlike a user token, which enumerates every business the
// person administers. Fall back to reading the configured business directly so
// the panel works under both token types.
async function listBusinesses(): Promise<RawBusiness[]> {
  const fields = "id,name,verification_status"
  const res = await graphGet<GraphList<RawBusiness>>("me/businesses", fields)
  if (res.data?.length) return res.data

  const businessId = process.env.META_TEST_BUSINESS_ID
  if (!businessId) return []
  return [await graphGet<RawBusiness>(businessId, fields)]
}

export async function getBusinessPortfolio(): Promise<BusinessPortfolioEntry[]> {
  const businesses = await listBusinesses()

  return Promise.all(
    businesses.map(async (b) => {
      const base = {
        id: b.id,
        name: b.name,
        verificationStatus: b.verification_status ?? null,
      }
      try {
        return { ...base, wabas: await getOwnedWabas(b.id), wabaError: null }
      } catch (err) {
        return {
          ...base,
          wabas: [],
          wabaError: err instanceof Error ? err.message : "Lookup failed",
        }
      }
    })
  )
}
