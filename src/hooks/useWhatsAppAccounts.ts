import { useQuery } from "@tanstack/react-query"

export interface WhatsAppAccount {
  phone_number_id: string
  phone_number: string
  phone_number_name: string
  business_account_name: string
  assigned_agent_id: string | null
}

async function fetchWhatsAppAccounts(): Promise<WhatsAppAccount[]> {
  const res = await fetch("/api/elevenlabs/whatsapp-accounts")
  if (!res.ok) throw new Error("Failed to fetch WhatsApp accounts")
  const data = await res.json()
  return data.accounts ?? []
}

export function useWhatsAppAccounts() {
  return useQuery({
    queryKey: ["whatsapp-accounts"],
    queryFn: fetchWhatsAppAccounts,
    staleTime: 5 * 60 * 1000,
  })
}
