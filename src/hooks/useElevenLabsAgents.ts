import { useQuery } from "@tanstack/react-query"

interface ElevenLabsAgent {
  agent_id: string
  name: string
}

async function fetchElevenLabsAgents(): Promise<ElevenLabsAgent[]> {
  const res = await fetch("/api/elevenlabs/agents")
  if (!res.ok) throw new Error("Failed to fetch ElevenLabs agents")
  const data = await res.json()
  return data.agents ?? []
}

export function useElevenLabsAgents() {
  return useQuery({
    queryKey: ["elevenlabs-agents"],
    queryFn: fetchElevenLabsAgents,
    staleTime: 5 * 60 * 1000, // agents list rarely changes
  })
}
