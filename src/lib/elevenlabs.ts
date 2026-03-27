const BASE_URL = "https://api.elevenlabs.io/v1"

function headers() {
  return {
    "xi-api-key": process.env.ELEVENLABS_API_KEY!,
    "Content-Type": "application/json",
  }
}

export async function getConversations(agentId: string) {
  const res = await fetch(
    `${BASE_URL}/convai/conversations?agent_id=${agentId}&summary_mode=include&page_size=50`,
    { headers: headers() }
  )
  if (!res.ok) throw new Error("Failed to fetch conversations")
  return res.json()
}

export async function getConversation(conversationId: string) {
  const res = await fetch(
    `${BASE_URL}/convai/conversations/${conversationId}`,
    { headers: headers() }
  )
  if (!res.ok) throw new Error("Failed to fetch conversation")
  return res.json()
}

export async function updateAgentPrompt(elevenlabsAgentId: string, systemPrompt: string) {
  const res = await fetch(`${BASE_URL}/convai/agents/${elevenlabsAgentId}`, {
    method: "PATCH",
    headers: headers(),
    body: JSON.stringify({
      conversation_config: {
        agent: {
          prompt: {
            prompt: systemPrompt,
          },
        },
      },
    }),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`ElevenLabs update failed: ${text}`)
  }
  return res.json()
}
