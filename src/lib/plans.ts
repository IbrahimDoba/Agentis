export const PLAN_PRICES: Record<string, number> = {
  free: 0,
  basic: 15000,
  starter: 35000,
  pro: 70000,
  enterprise: 0, // custom — commission set manually by admin
  reseller: 0, // white-label tenant users — billed via the reseller's pool, not self-pay
}

// Monthly Dailzero AI credit allowances per plan
export const PLAN_CREDIT_LIMITS: Record<string, number> = {
  free: 1000,
  basic: 25000,
  starter: 60000,
  pro: 100000,
  enterprise: -1,   // -1 = unlimited
  // Reseller users carry NO monthly plan allowance — their credits are granted
  // into the PAYG wallet from the reseller's pool, so every send draws the
  // wallet. Must be an explicit 0 (not absent) so the worker's
  // `?? PLAN_CREDIT_LIMITS.free` fallback never hands them free credits.
  reseller: 0,
}

/**
 * A plan's monthly allowance plus any still-valid one-cycle carryover (unused
 * allowance kept when the plan changed). Stacks on top of the base until
 * `carryoverExpiresAt`, then drops off. Returns -1 unchanged for unlimited.
 */
export function effectiveCreditLimit(
  baseLimit: number,
  carryoverCredits: number | null | undefined,
  carryoverExpiresAt: Date | string | null | undefined,
  now: Date = new Date()
): number {
  if (baseLimit === -1) return -1
  const carry = carryoverCredits ?? 0
  if (carry <= 0) return baseLimit
  if (carryoverExpiresAt && new Date(carryoverExpiresAt).getTime() <= now.getTime()) return baseLimit
  return baseLimit + carry
}

// Dailzero orchestrator usage policy (80% target margin)
export const AI_CREDIT_COSTS = {
  text: 5,
  image: 8,
  voicePerSec: 3,
  voiceMin: 15,
} as const

// Overage rate in Naira per 1,000 credits (null = no overage allowed)
export const PLAN_OVERAGE_RATE_PER_1K: Record<string, number | null> = {
  free: null,
  basic: null,
  starter: 1000,
  pro: 800,
  enterprise: null, // custom
  reseller: null, // no overage — reseller users can't self-pay; they pause when the wallet empties
}

export const PLAN_LABELS: Record<string, string> = {
  free: "Free",
  basic: "Basic",
  starter: "Starter",
  pro: "Pro",
  enterprise: "Enterprise",
  reseller: "Reseller plan",
}

export const PLAN_FEATURES: Record<string, string[]> = {
  free: [
    "1,000 credits / month",
    "1 AI agent",
    "WhatsApp integration",
    "Conversation logs",
    "Lead detection",
    "Community support",
  ],
  basic: [
    "25,000 credits / month",
    "~500 conversations / month",
    "1 AI agent",
    "WhatsApp integration",
    "Conversation logs",
    "Lead detection",
    "Customer memory & context",
    "Email support",
  ],
  starter: [
    "60,000 credits / month",
    "700 – 900 conversations / month",
    "1 AI agent",
    "WhatsApp integration",
    "Conversation logs & analytics",
    "Lead detection",
    "Customer memory & context",
    `Overage: ₦1,000 / 1k credits`,
    "Email support",
  ],
  pro: [
    "100,000 credits / month",
    "1,400 – 1,600 conversations / month",
    "2 AI agents",
    "Everything in Starter",
    "Priority email support",
    `Overage: ₦800 / 1k credits`,
  ],
  enterprise: [
    "Unlimited credits",
    "Multiple AI agents",
    "Everything in Pro",
    "Dedicated account manager",
    "Custom integrations",
    "Custom pricing",
  ],
}

export const PLAN_ORDER = ["free", "basic", "starter", "pro", "enterprise"]

// Max workspace members per plan (0 = team feature not available)
export const PLAN_SEAT_LIMITS: Record<string, number> = {
  free: 0,
  basic: 1,
  starter: 2,
  pro: 5,
  enterprise: -1, // unlimited
  reseller: 0, // overridden by seatLimitFor() for reseller tenants — see below
}

// How many team seats a user gets. Reseller-tenant logic overrides the plan map:
//   - A reseller admin always has teams (unlimited).
//   - A reseller's client gets teams once she's activated a plan for them
//     (i.e. they have an active subscription); before that, none.
//   - Platform (Dailzero) users go by PLAN_SEAT_LIMITS.
// Returns -1 for unlimited, 0 for "team disabled".
export function seatLimitFor(u: {
  role?: string | null
  resellerId?: string | null
  plan?: string | null
  subscriptionExpiresAt?: string | Date | null
}): number {
  if (u.role === "RESELLER_ADMIN") return -1
  if (u.resellerId && u.resellerId !== "platform") {
    const active = u.subscriptionExpiresAt ? new Date(u.subscriptionExpiresAt) > new Date() : false
    return active ? -1 : 0
  }
  return PLAN_SEAT_LIMITS[u.plan ?? "free"] ?? 0
}

export const COMMISSION_RATE = 0.15

export function calcCommission(plan: string): number | null {
  const price = PLAN_PRICES[plan]
  if (!price) return null // free or enterprise
  return price * COMMISSION_RATE
}

export function formatNaira(amount: number): string {
  return `₦${amount.toLocaleString("en-NG")}`
}
