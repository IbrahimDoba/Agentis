import OpenAI from "openai"
import type { LLMProvider, ChatMessage, ToolDefinition, ChatResult, EmbedResult } from "./types.js"
import { config } from "../config.js"
import { logger as rootLogger } from "../lib/logger.js"

const logger = rootLogger.child({ module: "openai-provider" })

export class OpenAIProvider implements LLMProvider {
  name = "openai"
  private client: OpenAI

  constructor() {
    this.client = new OpenAI({ apiKey: config.OPENAI_API_KEY })
  }

  async chat(params: {
    model: string
    system: string
    messages: ChatMessage[]
    tools?: ToolDefinition[]
    temperature?: number
    max_output_tokens?: number
  }): Promise<ChatResult> {
    const messages: OpenAI.ChatCompletionMessageParam[] = [
      { role: "system", content: params.system },
      ...params.messages.map((m) => this.toOpenAIMessage(m)),
    ]

    const requestParams: OpenAI.ChatCompletionCreateParamsNonStreaming = {
      model: params.model,
      messages,
      temperature: params.temperature ?? 0.7,
      max_tokens: params.max_output_tokens ?? 800,
    }

    if (params.tools && params.tools.length > 0) {
      requestParams.tools = params.tools.map((t) => ({
        type: "function" as const,
        function: {
          name: t.function.name,
          description: t.function.description,
          parameters: t.function.parameters,
        },
      }))
    }

    const start = Date.now()
    const response = await this.client.chat.completions.create(requestParams)
    const duration = Date.now() - start

    const choice = response.choices[0]
    const toolCalls = (choice?.message?.tool_calls ?? []).map((tc) => {
      let args: Record<string, unknown> = {}
      try {
        args = JSON.parse(tc.function.arguments)
      } catch {
        logger.warn({ raw: tc.function.arguments }, "Failed to parse tool call arguments")
      }
      return {
        id: tc.id,
        name: tc.function.name,
        arguments: args,
      }
    })

    let finishReason: ChatResult["finish_reason"] = "stop"
    if (choice?.finish_reason === "tool_calls") finishReason = "tool_calls"
    else if (choice?.finish_reason === "length") finishReason = "length"

    logger.info({
      model: params.model,
      duration,
      inputTokens: response.usage?.prompt_tokens,
      outputTokens: response.usage?.completion_tokens,
      finishReason,
      hasToolCalls: toolCalls.length > 0,
    }, "OpenAI chat completed")

    return {
      content: choice?.message?.content ?? null,
      tool_calls: toolCalls,
      usage: {
        input_tokens: response.usage?.prompt_tokens ?? 0,
        output_tokens: response.usage?.completion_tokens ?? 0,
      },
      finish_reason: finishReason,
    }
  }

  async embed(params: {
    model: string
    texts: string[]
  }): Promise<EmbedResult> {
    const response = await this.client.embeddings.create({
      model: params.model,
      input: params.texts,
    })

    return {
      embeddings: response.data.map((d) => d.embedding),
      usage: { input_tokens: response.usage.prompt_tokens },
    }
  }

  private toOpenAIMessage(msg: ChatMessage): OpenAI.ChatCompletionMessageParam {
    if (msg.role === "tool") {
      return {
        role: "tool",
        content: msg.content ?? "",
        tool_call_id: msg.tool_call_id ?? "",
      }
    }
    if (msg.role === "assistant") {
      if (msg.tool_calls && msg.tool_calls.length > 0) {
        return {
          role: "assistant",
          content: msg.content ?? null,
          tool_calls: msg.tool_calls.map((tc) => ({
            id: tc.id,
            type: "function" as const,
            function: {
              name: tc.name,
              arguments: JSON.stringify(tc.arguments),
            },
          })),
        }
      }
      return { role: "assistant", content: msg.content ?? "" }
    }
    return { role: "user", content: msg.content ?? "" }
  }
}
