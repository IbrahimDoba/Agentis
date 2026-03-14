import { useQuery } from "@tanstack/react-query"

async function fetchConversationDetail(id: string) {
  const res = await fetch(`/api/conversations/${id}`)
  if (!res.ok) throw new Error("Failed to fetch conversation")
  return res.json()
}

export function useConversationDetail(id: string | null) {
  return useQuery({
    queryKey: ["conversation", id],
    queryFn: () => fetchConversationDetail(id!),
    enabled: !!id,
    staleTime: 5 * 60 * 1000, // transcripts don't change — cache for 5 min
  })
}
