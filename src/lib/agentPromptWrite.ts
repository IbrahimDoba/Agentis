import { db } from "@/lib/db"
import { buildOrchestratorSystemPrompt } from "@/lib/orchestratorSync"
import { PROMPT_EDIT_FIELDS, type PromptEditField } from "@/lib/promptEdit"

// The ONLY place an agent's prompt fields are written.
//
// Agent.responseGuidelines is the field operators edit, but the runtime reads
// OrchestratorAgent.systemPrompt — a denormalised copy. Writing one without the
// other is why an activated auto-config draft never reached the running agent.
// Both writes go in one transaction here so that split can't happen again.

export function isPromptEditField(field: string): field is PromptEditField {
  return (PROMPT_EDIT_FIELDS as readonly string[]).includes(field)
}

export async function writeAgentPromptField(
  agentId: string,
  field: PromptEditField,
  value: string
): Promise<void> {
  // Third of three checks (request zod, LLM schema enum, this). This is the one
  // that holds when a non-LLM caller reuses the helper.
  if (!isPromptEditField(field)) {
    throw new Error(`Refusing to write disallowed field "${field}"`)
  }

  const agent = await db.agent.findUnique({
    where: { id: agentId },
    select: { agentRuntime: true, elevenlabsAgentId: true },
  })
  if (!agent) throw new Error(`Agent ${agentId} not found`)

  await db.$transaction(async (tx) => {
    await tx.agent.update({ where: { id: agentId }, data: { [field]: value } })

    if (field === "responseGuidelines" && agent.agentRuntime === "orchestrator") {
      // updateMany, not update: the relation permits more than one orchestrator
      // row per agent, and update() would throw on a non-unique where.
      await tx.orchestratorAgent.updateMany({
        where: { agentId },
        data: { systemPrompt: buildOrchestratorSystemPrompt(value) },
      })
    }
  })
}
