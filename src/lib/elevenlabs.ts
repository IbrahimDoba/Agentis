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

export async function getElevenLabsAgent(elevenlabsAgentId: string) {
  const res = await fetch(`${BASE_URL}/convai/agents/${elevenlabsAgentId}`, {
    headers: headers(),
  })
  if (!res.ok) throw new Error("Failed to fetch ElevenLabs agent")
  return res.json()
}

export async function uploadKnowledgeBaseFile(file: File): Promise<{ id: string; name: string }> {
  const bytes = await file.arrayBuffer()
  const blob = new Blob([bytes], { type: file.type || "application/octet-stream" })
  const formData = new FormData()
  formData.append("file", blob, file.name)
  formData.append("name", file.name)
  const res = await fetch(`${BASE_URL}/convai/knowledge-base/file`, {
    method: "POST",
    headers: { "xi-api-key": process.env.ELEVENLABS_API_KEY! },
    body: formData,
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`ElevenLabs KB upload failed: ${text}`)
  }
  return res.json()
}

export async function addKnowledgeBaseUrl(url: string, name?: string): Promise<{ id: string; name: string }> {
  const res = await fetch(`${BASE_URL}/convai/knowledge-base/url`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ url, name: name || url }),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`ElevenLabs KB URL add failed: ${text}`)
  }
  return res.json()
}

export async function updateAgentKnowledgeBase(
  elevenlabsAgentId: string,
  knowledgeBase: { id: string; name: string; type: string; usage_mode: string }[]
) {
  const res = await fetch(`${BASE_URL}/convai/agents/${elevenlabsAgentId}`, {
    method: "PATCH",
    headers: headers(),
    body: JSON.stringify({
      conversation_config: {
        agent: {
          prompt: {
            knowledge_base: knowledgeBase,
          },
        },
      },
    }),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`ElevenLabs KB update failed: ${text}`)
  }
  return res.json()
}

export async function deleteKnowledgeBaseDoc(docId: string) {
  const res = await fetch(`${BASE_URL}/convai/knowledge-base/${docId}?force=false`, {
    method: "DELETE",
    headers: headers(),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`ElevenLabs KB delete failed: ${text}`)
  }
}

export async function updateAgentTools(elevenlabsAgentId: string, tools: any[]) {
  const payload = {
    conversation_config: { agent: { prompt: { tools } } },
  }

  const res = await fetch(`${BASE_URL}/convai/agents/${elevenlabsAgentId}`, {
    method: "PATCH",
    headers: headers(),
    body: JSON.stringify(payload),
  })

  if (!res.ok) {
    const text = await res.text()

    // If stale KB documents are blocking the update, remove them and retry
    let parsed: any
    try { parsed = JSON.parse(text) } catch { /* not JSON */ }
    if (parsed?.detail?.status === "documents_not_found") {
      const staleIds: string[] = parsed.detail.message
        .match(/['"]([^'"]+)['"]/g)
        ?.map((s: string) => s.replace(/['"]/g, "")) ?? []

      if (staleIds.length > 0) {
        // Fetch current agent, strip stale KB entries, patch KB first
        const agent = await getElevenLabsAgent(elevenlabsAgentId)
        const currentKb: any[] = agent?.conversation_config?.agent?.prompt?.knowledge_base ?? []
        const cleanKb = currentKb.filter((doc: any) => !staleIds.includes(doc.id))
        await fetch(`${BASE_URL}/convai/agents/${elevenlabsAgentId}`, {
          method: "PATCH",
          headers: headers(),
          body: JSON.stringify({
            conversation_config: { agent: { prompt: { knowledge_base: cleanKb } } },
          }),
        })
        // Retry tools update
        const retry = await fetch(`${BASE_URL}/convai/agents/${elevenlabsAgentId}`, {
          method: "PATCH",
          headers: headers(),
          body: JSON.stringify(payload),
        })
        if (!retry.ok) {
          const retryText = await retry.text()
          throw new Error(`ElevenLabs tools update failed: ${retryText}`)
        }
        return retry.json()
      }
    }

    throw new Error(`ElevenLabs tools update failed: ${text}`)
  }

  return res.json()
}

export async function setAgentWebhook(elevenlabsAgentId: string) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL
  const webhookSecret = process.env.ELEVENLABS_WEBHOOK_SECRET

  const res = await fetch(`${BASE_URL}/convai/agents/${elevenlabsAgentId}`, {
    method: "PATCH",
    headers: headers(),
    body: JSON.stringify({
      platform_settings: {
        // Fires after conversation ends — saves transcript + updates customer memory
        post_call_webhook: {
          url: `${appUrl}/api/webhook/elevenlabs`,
          ...(webhookSecret ? { secret: webhookSecret } : {}),
        },
        // Fires before conversation starts — injects customer memory into the session
        pre_call_webhook: {
          url: `${appUrl}/api/webhook/elevenlabs/initiate`,
          ...(webhookSecret ? { secret: webhookSecret } : {}),
        },
      },
    }),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`ElevenLabs webhook setup failed: ${text}`)
  }

  return res.json()
}

const CUSTOMER_HISTORY_TOOL = {
  type: "webhook",
  name: "get_customer_history",
  description:
    "Call this tool at the start of every conversation. It retrieves the caller's previous interaction history based on their phone number. Use the returned summary to greet the customer by name, reference past interactions, and provide personalized assistance. If no history is found, treat them as a first-time caller.",
  disable_interruptions: false,
  force_pre_tool_speech: "auto",
  tool_call_sound: null,
  tool_call_sound_behavior: "auto",
  tool_error_handling_mode: "auto",
  execution_mode: "immediate",
  api_schema: {
    url: "https://www.dailzero.com/api/webhook/elevenlabs/customer-history",
    method: "POST",
    path_params_schema: [],
    query_params_schema: [],
    request_body_schema: {
      id: "body",
      type: "object",
      description: "Request body containing the caller's phone number, agent ID and conversation ID",
      properties: [
        {
          id: "phone_number",
          type: "string",
          value_type: "dynamic_variable",
          description: "",
          dynamic_variable: "system__caller_id",
          constant_value: "",
          enum: null,
          is_system_provided: false,
          required: true,
        },
        {
          id: "agent_id",
          type: "string",
          value_type: "dynamic_variable",
          description: "",
          dynamic_variable: "system__agent_id",
          constant_value: "",
          enum: null,
          is_system_provided: false,
          required: true,
        },
        {
          id: "conversation_id",
          type: "string",
          value_type: "dynamic_variable",
          description: "",
          dynamic_variable: "system__conversation_id",
          constant_value: "",
          enum: null,
          is_system_provided: false,
          required: true,
        },
      ],
      required: false,
      value_type: "llm_prompt",
    },
    request_headers: [],
    content_type: "application/json",
    auth_connection: null,
  },
  assignments: [],
  response_timeout_secs: 20,
  dynamic_variables: { dynamic_variable_placeholders: {} },
  response_mocks: [],
}

/**
 * Adds the get_customer_history tool to an ElevenLabs agent if not already present.
 * Safe to call multiple times — idempotent.
 */
export async function addCustomerHistoryTool(elevenlabsAgentId: string): Promise<void> {
  const agent = await getElevenLabsAgent(elevenlabsAgentId)
  const currentTools: any[] = agent?.conversation_config?.agent?.prompt?.tools ?? []

  const alreadyExists = currentTools.some((t: any) => t.name === "get_customer_history")
  if (alreadyExists) {
    console.log(`[addCustomerHistoryTool] Tool already present on agent ${elevenlabsAgentId}, skipping.`)
    return
  }

  await updateAgentTools(elevenlabsAgentId, [...currentTools, CUSTOMER_HISTORY_TOOL])
  console.log(`[addCustomerHistoryTool] ✅ Tool added to agent ${elevenlabsAgentId}`)
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
