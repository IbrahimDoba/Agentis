// Thin client for the orchestrator's synchronous chat endpoint (POST /v1/chat).
// The orchestrator runs the shared agent engine (runAgentTurn) and returns the
// reply + token usage; this is how the developer API reaches that engine.

const ORCHESTRATOR_URL = process.env.ORCHESTRATOR_URL || "http://localhost:4100"
const ORCHESTRATOR_API_KEY = process.env.ORCHESTRATOR_API_KEY

export interface OrchestratorChatResult {
  reply: string | null
  usage: { input_tokens: number; output_tokens: number }
  conversationId: string
}

export class OrchestratorChatError extends Error {
  constructor(
    public status: number,
    public body: string
  ) {
    super(`Orchestrator chat failed: ${status}`)
    this.name = "OrchestratorChatError"
  }
}

export async function callOrchestratorChat(params: {
  agentId: string
  messages: { role: "user" | "assistant"; content: string }[]
  conversationId?: string
}): Promise<OrchestratorChatResult> {
  if (!ORCHESTRATOR_API_KEY) {
    throw new Error("ORCHESTRATOR_API_KEY is not configured")
  }

  const res = await fetch(`${ORCHESTRATOR_URL}/v1/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${ORCHESTRATOR_API_KEY}`,
    },
    body: JSON.stringify(params),
  })

  if (!res.ok) {
    const body = await res.text().catch(() => "")
    throw new OrchestratorChatError(res.status, body)
  }

  return (await res.json()) as OrchestratorChatResult
}
