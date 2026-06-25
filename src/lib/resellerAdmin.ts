import { auth } from "@/lib/auth"

// Shared guard for the reseller-admin surface (/reseller + /api/reseller).
// A RESELLER_ADMIN may only ever act within their own tenant; the super-admin
// (ADMIN, root tenant) is allowed through too and acts on the platform tenant.
// Every reseller query MUST be scoped to the returned `resellerId`.

export type ResellerAdminContext = {
  resellerId: string
  userId: string
  role: string
}

export async function getResellerAdminContext(): Promise<ResellerAdminContext | null> {
  const session = await auth()
  if (!session) return null
  const role = session.user.role
  if (role !== "RESELLER_ADMIN" && role !== "ADMIN") return null
  return { resellerId: session.user.resellerId, userId: session.user.id, role }
}
