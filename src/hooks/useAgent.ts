import { useQuery } from "@tanstack/react-query"
import type { AgentPublic } from "@/types"

async function fetchAgent(id: string): Promise<{ agent: AgentPublic | null }> {
  const res = await fetch(`/api/agents/${id}`)
  if (!res.ok) throw new Error("Failed to load agent")
  const data = await res.json()
  // The API returns the agent directly (not wrapped in { agent })
  return { agent: data }
}

export function useAgent(id: string) {
  return useQuery({
    queryKey: ["agent", id],
    queryFn: () => fetchAgent(id),
    enabled: !!id,
    staleTime: 60 * 1000,
  })
}
