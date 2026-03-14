const BASE_URL = "https://api.elevenlabs.io/v1"

function headers() {
  return {
    "xi-api-key": process.env.ELEVENLABS_API_KEY!,
    "Content-Type": "application/json",
  }
}

export async function getConversations(agentId: string) {
  const res = await fetch(
    `${BASE_URL}/convai/conversations?agent_id=${agentId}`,
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
