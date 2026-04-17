export const PLAN_PRICES: Record<string, number> = {
  free: 0,
  starter: 50000,
  pro: 85000,
  enterprise: 0, // custom — commission set manually by admin
}

// Monthly ElevenLabs credit allowances per plan
export const PLAN_CREDIT_LIMITS: Record<string, number> = {
  free: 2000,
  starter: 60000,
  pro: 100000,
  enterprise: -1,   // -1 = unlimited
}

// Overage rate in Naira per 1,000 credits (null = no overage allowed)
export const PLAN_OVERAGE_RATE_PER_1K: Record<string, number | null> = {
  free: null,
  starter: 1000,
  pro: 800,
  enterprise: null, // custom
}

export const PLAN_LABELS: Record<string, string> = {
  free: "Free",
  starter: "Starter",
  pro: "Pro",
  enterprise: "Enterprise",
}

export const PLAN_FEATURES: Record<string, string[]> = {
  free: [
    "2,000 credits / month",
    "1 AI agent",
    "WhatsApp integration",
    "Conversation logs",
    "Lead detection",
    "Community support",
  ],
  starter: [
    "60,000 credits / month",
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

export const PLAN_ORDER = ["free", "starter", "pro", "enterprise"]

// Max workspace members per plan (0 = team feature not available)
export const PLAN_SEAT_LIMITS: Record<string, number> = {
  free: 0,
  starter: 2,
  pro: 5,
  enterprise: -1, // unlimited
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
