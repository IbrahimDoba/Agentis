import { useQuery } from "@tanstack/react-query"
import type { AgentPublic } from "@/types"

async function fetchAgents(): Promise<AgentPublic[]> {
  const res = await fetch("/api/agents")
  if (!res.ok) throw new Error("Failed to load agents")
  return res.json()
}

export function useAgents() {
  return useQuery({
    queryKey: ["agents"],
    queryFn: fetchAgents,
    staleTime: 30 * 1000,
  })
}
