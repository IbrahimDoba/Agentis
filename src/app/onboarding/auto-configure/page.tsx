import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import { AutoConfigureClient } from "./AutoConfigureClient"

interface PageProps {
  searchParams: Promise<{ agentId?: string }>
}

// Single page that handles both "configuring" (polling progress) and
// "review" (editable draft) states. Status comes from
// /api/agents/[id]/auto-configure and switches the rendered view.
export default async function AutoConfigurePage({ searchParams }: PageProps) {
  const session = await auth()
  if (!session) redirect("/login")

  const { agentId } = await searchParams
  if (!agentId) redirect("/dashboard")

  return <AutoConfigureClient agentId={agentId} />
}
