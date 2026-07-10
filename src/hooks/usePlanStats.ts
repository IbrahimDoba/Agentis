import { useQuery } from "@tanstack/react-query"

export interface PlanStats {
  totalConversations: number
  totalLeads: number
  totalContacts: number
  totalCreditsUsed: number
  monthlyCreditsUsed: number
  monthlyAiCredits: number
  monthlyHumanCredits: number
  creditLimit: number
  plan: string
  subscriptionExpiresAt: string | null
  creditBalance?: number
  creditsExpireAt?: string | null
  // Lifetime credits drawn from the PAYG wallet — the usage-bar numerator when
  // the wallet takes over (denominator = walletUsed + creditBalance).
  walletUsed?: number
  isReseller?: boolean
}

export function usePlanStats() {
  return useQuery<PlanStats>({
    queryKey: ["conversation-stats"],
    queryFn: async () => {
      const res = await fetch("/api/conversations/stats")
      if (!res.ok) throw new Error("Failed to fetch stats")
      return res.json()
    },
    staleTime: 60 * 1000,
  })
}
