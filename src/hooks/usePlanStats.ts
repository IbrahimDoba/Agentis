import { useQuery } from "@tanstack/react-query"

export interface PlanStats {
  totalConversations: number
  totalLeads: number
  totalContacts: number
  totalCreditsUsed: number
  monthlyCreditsUsed: number
  creditLimit: number
  plan: string
  subscriptionExpiresAt: string | null
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
