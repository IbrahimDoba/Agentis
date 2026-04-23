export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool"
  content: string | null
  tool_call_id?: string
  name?: string
  tool_calls?: { id: string; name: string; arguments: Record<string, unknown> }[]
}

export interface ToolDefinition {
  type: "function"
  function: {
    name: string
    description: string
    parameters: Record<string, unknown>
  }
}

export interface ChatResult {
  content: string | null
  tool_calls: { id: string; name: string; arguments: Record<string, unknown> }[]
  usage: { input_tokens: number; output_tokens: number }
  finish_reason: "stop" | "tool_calls" | "length" | "error"
}

export interface EmbedResult {
  embeddings: number[][]
  usage: { input_tokens: number }
}

export interface LLMProvider {
  name: string

  chat(params: {
    model: string
    system: string
    messages: ChatMessage[]
    tools?: ToolDefinition[]
    temperature?: number
    max_output_tokens?: number
  }): Promise<ChatResult>

  embed(params: {
    model: string
    texts: string[]
  }): Promise<EmbedResult>
}
