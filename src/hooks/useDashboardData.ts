import { useQuery } from "@tanstack/react-query"
import type { AgentPublic, UserPublic } from "@/types"

async function fetchDashboardData(): Promise<{ user: UserPublic; agent: AgentPublic | null }> {
  const res = await fetch("/api/me")
  if (!res.ok) throw new Error("Failed to load dashboard data")
  return res.json()
}

export function useDashboardData() {
  return useQuery({
    queryKey: ["me"],
    queryFn: fetchDashboardData,
    staleTime: 60 * 1000, // 1 minute — DB data changes rarely
  })
}
