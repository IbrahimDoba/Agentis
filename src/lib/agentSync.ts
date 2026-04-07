import { updateAgentPrompt } from "@/lib/elevenlabs"
import type { Product } from "@/types"

interface AgentData {
  responseGuidelines?: string | null
  productsData?: Product[] | null
}

export async function buildAndSyncElevenLabsPrompt(
  elevenlabsAgentId: string,
  agent: AgentData
): Promise<void> {
  const lines: string[] = []

  // Customer context block must always be first
  lines.push("## Customer Context")
  lines.push("{{customer_context}}")
  lines.push("")

  if (agent.responseGuidelines) {
    lines.push(agent.responseGuidelines)
  }

  if (agent.productsData && agent.productsData.length > 0) {
    lines.push("\n## Product Catalogue")
    agent.productsData.forEach((p) => {
      let entry = `- ${p.name}`
      if (p.price) entry += ` — ${p.price}`
      if (p.description) entry += `: ${p.description}`
      if (p.link) entry += ` (${p.link})`
      lines.push(entry)
    })
  }

  const systemPrompt = lines.join("\n")
  await updateAgentPrompt(elevenlabsAgentId, systemPrompt)
}
