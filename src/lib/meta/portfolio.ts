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

export async function getBusinessPortfolio(): Promise<BusinessPortfolioEntry[]> {
  const businesses = await graphGet<
    GraphList<{ id: string; name: string; verification_status?: string }>
  >("me/businesses", "id,name,verification_status")

  return Promise.all(
    (businesses.data ?? []).map(async (b) => {
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
