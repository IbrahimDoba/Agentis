export const PLAN_PRICES: Record<string, number> = {
  free: 0,
  basic: 20000,
  starter: 40000,
  pro: 75000,
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

// On renewal OR plan change, unused allowance rolls into the next cycle, capped
// at this fraction of the OLD plan's base allowance (so a light user can bank at
// most +25% for one cycle, never compounding).
export const CARRYOVER_CAP_RATE = 0.25

/**
 * How much unused allowance to carry into the next cycle: the unused amount
 * (effective limit − usage this cycle), capped at `capRate` of the plan's BASE
 * allowance. Capping against the base (not the effective limit) prevents a
 * still-valid prior carryover from compounding. Returns 0 for unlimited/zero
 * base plans.
 */
export function carryoverForNextCycle(
  oldEffectiveLimit: number,
  usedThisCycle: number,
  capBaseLimit: number,
  capRate: number = CARRYOVER_CAP_RATE
): number {
  const unused = Math.max(0, oldEffectiveLimit - usedThisCycle)
  const cap = Math.max(0, Math.floor(capBaseLimit * capRate))
  return Math.min(unused, cap)
}

// Dailzero orchestrator usage policy (80% target margin)
export const AI_CREDIT_COSTS = {
  text: 5,
  image: 8,
  voicePerSec: 3,
  voiceMin: 15,
} as const

// Buyers reason in "messages", not raw credits, so pricing surfaces express each
// plan's size as an estimated AI-message count: the allowance ÷ the cost of a
// typical text reply. Real spend varies with message length (billing is
// token-based, min 1 credit) and images/voice cost more, so this is a
// deliberate, clearly-approximate figure. Returns null for unlimited (-1).
export function estimatedAiMessages(creditLimit: number): number | null {
  if (creditLimit < 0) return null
  return Math.floor(creditLimit / AI_CREDIT_COSTS.text)
}

// "≈ 5,000 AI messages / month" label for a plan slug — the single source every
// pricing surface (marketing + dashboard) uses so the numbers never drift.
export function aiMessagesPerMonth(plan: string): string {
  const n = estimatedAiMessages(PLAN_CREDIT_LIMITS[plan] ?? 0)
  return n === null
    ? "Unlimited AI messages"
    : `≈ ${n.toLocaleString("en-NG")} AI messages / month`
}

// Plain-language explainer of the credit system, shared by the marketing pricing
// pages and the dashboard so the wording stays consistent everywhere.
export const CREDITS_NOTE =
  "Credits are what your AI spends to reply — a typical AI message costs about 5 credits (longer replies, images and voice notes use a little more). Your monthly plan credits are used first, then any pay-as-you-go top-ups. When both run out your agent simply pauses until you renew or top up — no surprise charges."

// Overage rate in Naira per 1,000 credits (null = no overage allowed)
// Overage is REMOVED platform-wide: no plan overshoots its allowance. Every
// plan now bills monthly allowance first, then the PAYG wallet, then STOPS.
// Kept as an all-null table (rather than deleted) so the many consumers that
// read it — allowsOverage(), renewal billing, dashboard guards — uniformly see
// "no overage entitlement" without a broad refactor. A null rate means: no
// overshoot at send time, and nothing billed for exceeding the plan.
export const PLAN_OVERAGE_RATE_PER_1K: Record<string, number | null> = {
  free: null,
  basic: null,
  starter: null,
  pro: null,
  enterprise: null, // custom
  reseller: null,
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
    aiMessagesPerMonth("free"),
    "1 AI agent",
    "WhatsApp integration",
    "Conversation logs",
    "Lead detection",
    "Community support",
  ],
  basic: [
    "25,000 credits / month",
    aiMessagesPerMonth("basic"),
    "1 AI agent",
    "WhatsApp integration",
    "Conversation logs",
    "Lead detection",
    "Customer memory & context",
    "Email support",
  ],
  starter: [
    "60,000 credits / month",
    aiMessagesPerMonth("starter"),
    "1 AI agent",
    "WhatsApp integration",
    "Conversation logs & analytics",
    "Lead detection",
    "Customer memory & context",
    "Email support",
  ],
  pro: [
    "100,000 credits / month",
    aiMessagesPerMonth("pro"),
    "2 AI agents",
    "Everything in Starter",
    "Priority email support",
  ],
  enterprise: [
    "Unlimited credits",
    aiMessagesPerMonth("enterprise"),
    "Multiple AI agents",
    "Everything in Pro",
    "Dedicated account manager",
    "Custom integrations",
    "Custom pricing",
  ],
}

export const PLAN_ORDER = ["free", "basic", "starter", "pro", "enterprise"]

// PLAN_ORDER is the self-serve upgrade ladder, so it deliberately excludes
// "reseller": those tenants are billed from the reseller's pool, not self-pay,
// and have no rung on this ladder. That makes PLAN_ORDER.indexOf() unsafe —
// it answers -1 for them, and -1 compares as "cheaper than free", which silently
// made every plan look like an upgrade and stopped downgrades being scheduled.
//
// Rank returns null for a plan that isn't on the ladder, so callers have to say
// what they want to happen instead of inheriting -1 arithmetic.
export function planRank(plan: string | null | undefined): number | null {
  const i = PLAN_ORDER.indexOf(plan ?? "")
  return i === -1 ? null : i
}

// Both answer false when either plan is off the ladder: an unrankable plan is
// not comparable, which is different from being equal.
export function isPlanUpgrade(from: string | null | undefined, to: string | null | undefined): boolean {
  const a = planRank(from)
  const b = planRank(to)
  return a !== null && b !== null && b > a
}

export function isPlanDowngrade(from: string | null | undefined, to: string | null | undefined): boolean {
  const a = planRank(from)
  const b = planRank(to)
  return a !== null && b !== null && b < a
}

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
