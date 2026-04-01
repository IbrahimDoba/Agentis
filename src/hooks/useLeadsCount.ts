import { useQuery } from "@tanstack/react-query"

async function fetchLeadsCount(): Promise<number> {
  const res = await fetch("/api/leads")
  if (!res.ok) throw new Error("Failed to load leads")
  const data = await res.json()
  return data.leads.length
}

export function useLeadsCount() {
  return useQuery({
    queryKey: ["leads-count"],
    queryFn: fetchLeadsCount,
    staleTime: 60 * 1000,
  })
}
