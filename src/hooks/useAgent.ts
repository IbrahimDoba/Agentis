import { useQuery } from "@tanstack/react-query"
import type { AgentPublic } from "@/types"

async function fetchAgent(): Promise<{ agent: AgentPublic | null }> {
  const res = await fetch("/api/me/agent")
  if (!res.ok) throw new Error("Failed to load agent")
  return res.json()
}

export function useAgent() {
  return useQuery({
    queryKey: ["me", "agent"],
    queryFn: fetchAgent,
    staleTime: 60 * 1000,
  })
}
