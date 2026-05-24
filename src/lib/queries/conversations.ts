import type { PrismaClient } from "@/generated/prisma/client"

// Phone/name resolution helpers for the orchestrator conversation list.
// Extracted from the route handler so they can be unit-tested against the
// real dev DB without the auth/HTTP layer.

export function normalizeName(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase()
}

// WhatsApp "LID" identifiers are longer than a real phone number (>13 digits).
// Conversations keyed by a LID need their display number resolved another way.
export function isLikelyLid(raw: string): boolean {
  const digits = raw.replace(/@.*$/, "").replace(/\D/g, "")
  return digits.length > 13
}

/**
 * Build a name → phone-numbers map for LID resolution, fetching ONLY the
 * customers whose name matches one of the given contact names.
 *
 * Replaces the previous `customer.findMany({ take: 1000 })` that pulled every
 * customer row on every dashboard poll. For a dashboard that polls every 30s,
 * that was up to 1000 rows per tick per open tab; now it's bounded by the few
 * LID conversations actually on the page.
 */
export async function getCustomerPhonesByName(
  db: Pick<PrismaClient, "customer">,
  agentId: string,
  contactNames: Array<string | null | undefined>
): Promise<Map<string, Set<string>>> {
  const phonesByName = new Map<string, Set<string>>()

  const uniqueNames = [...new Set(contactNames.map(normalizeName).filter(Boolean))]
  if (uniqueNames.length === 0) return phonesByName

  // Case-insensitive match on the original (non-normalized) customer name.
  const customers = await db.customer.findMany({
    where: {
      agentId,
      OR: uniqueNames.map((n) => ({ name: { equals: n, mode: "insensitive" as const } })),
    },
    select: { phoneNumber: true, name: true },
  })

  for (const customer of customers) {
    const key = normalizeName(customer.name)
    if (!key) continue
    const set = phonesByName.get(key) ?? new Set<string>()
    set.add(customer.phoneNumber)
    phonesByName.set(key, set)
  }
  return phonesByName
}

/**
 * Decide what phone number to display for a conversation. Pure function.
 * Precedence: worker LID mapping > unique customer-name match > raw phone.
 */
export function resolveDisplayPhone(
  conv: { phoneNumber: string; contactName: string | null },
  phonesByName: Map<string, Set<string>>,
  workerResolved: Map<string, string>
): { displayPhoneNumber: string; phoneSource: string } {
  const resolvedFromWorker = workerResolved.get(conv.phoneNumber) ?? null

  const nameKey = normalizeName(conv.contactName)
  const candidates = nameKey ? phonesByName.get(nameKey) : undefined
  // Only trust a name match when it's unambiguous (exactly one phone).
  const resolvedFromName =
    isLikelyLid(conv.phoneNumber) && candidates && candidates.size === 1
      ? Array.from(candidates)[0]
      : null

  return {
    displayPhoneNumber: resolvedFromWorker ?? resolvedFromName ?? conv.phoneNumber,
    phoneSource: resolvedFromWorker
      ? "worker_lid_mapping"
      : resolvedFromName
        ? "customer_name_match"
        : "conversation",
  }
}
