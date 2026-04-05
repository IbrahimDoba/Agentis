import { useQuery } from "@tanstack/react-query"

export function useLeadsCount() {
  return useQuery<number>({
    queryKey: ["leads-count"],
    queryFn: async () => {
      const res = await fetch("/api/conversations/stats")
      if (!res.ok) throw new Error("Failed to load stats")
      const data = await res.json()
      return data.totalLeads
    },
    staleTime: 60 * 1000,
  })
}
