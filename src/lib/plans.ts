export const PLAN_PRICES: Record<string, number> = {
  free: 0,
  starter: 50000,
  pro: 85000,
  enterprise: 0, // custom — commission set manually by admin
}

export const PLAN_LABELS: Record<string, string> = {
  free: "Free",
  starter: "Starter",
  pro: "Pro",
  enterprise: "Enterprise",
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
