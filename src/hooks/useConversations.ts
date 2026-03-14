import { useQuery } from "@tanstack/react-query"
import type { Conversation } from "@/types"

async function fetchConversations(): Promise<Conversation[]> {
  const res = await fetch("/api/conversations")
  if (!res.ok) throw new Error("Failed to fetch conversations")
  const data = await res.json()
  return data.conversations ?? []
}

export function useConversations() {
  return useQuery({
    queryKey: ["conversations"],
    queryFn: fetchConversations,
    staleTime: 30 * 1000, // refetch after 30s
  })
}
