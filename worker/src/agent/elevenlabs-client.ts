import WebSocket, { type RawData } from "ws"
import { config } from "../config.js"
import { logger as rootLogger } from "../lib/logger.js"

const logger = rootLogger.child({ module: "elevenlabs-client" })

interface SendMessageOptions {
  elevenlabsAgentId: string
  userMessage: string
  phoneNumber: string
  customerName: string | null
  conversationHistory: Array<{ summary?: string; startTime?: string }>
  customerSummary: string | null
}

/**
 * Opens a WebSocket to ElevenLabs ConvAI, sends the user message,
 * waits for the complete agent reply, then closes the connection.
 *
 * Returns the agent's text reply, or null on failure.
 */
async function sendMessage(opts: SendMessageOptions): Promise<string | null> {
  return new Promise((resolve) => {
    const url = `wss://api.elevenlabs.io/v1/convai/conversation?agent_id=${opts.elevenlabsAgentId}`
    const ws = new WebSocket(url, {
      headers: { "xi-api-key": config.ELEVENLABS_API_KEY },
    })

    let fullReply = ""
    let resolved = false
    const timeout = setTimeout(() => {
      logger.warn({ agentId: opts.elevenlabsAgentId }, "ElevenLabs WS timed out")
      ws.close()
      if (!resolved) { resolved = true; resolve(null) }
    }, 30_000)

    ws.on("open", () => {
      // Inject customer context as dynamic variables
      const historyText = opts.conversationHistory
        .map((h, i) => `[${i + 1}] ${h.startTime ? new Date(h.startTime).toLocaleDateString() : "Unknown date"}: ${h.summary ?? "No summary"}`)
        .join("\n")

      const initPayload = {
        type: "conversation_initiation_client_data",
        dynamic_variables: {
          customer_name: opts.customerName ?? "there",
          customer_phone: opts.phoneNumber,
          customer_summary: opts.customerSummary ?? "New customer — no prior history.",
          customer_history: historyText || "No prior conversations.",
        },
      }

      ws.send(JSON.stringify(initPayload))

      // Send the user's message
      ws.send(JSON.stringify({ type: "user_message", text: opts.userMessage }))
    })

    ws.on("message", (raw: RawData) => {
      try {
        const event = JSON.parse(raw.toString()) as Record<string, unknown>

        if (event["type"] === "agent_response") {
          fullReply = (event["agent_response"] as string) ?? fullReply
        } else if (event["type"] === "agent_chat_response_part" && event["event"] === "delta") {
          fullReply += (event["text"] as string) ?? ""
        } else if (event["type"] === "conversation_ended") {
          clearTimeout(timeout)
          ws.close()
          if (!resolved) { resolved = true; resolve(fullReply.trim() || null) }
        }
      } catch {
        // Ignore malformed events
      }
    })

    ws.on("error", (err: Error) => {
      logger.error({ err }, "ElevenLabs WS error")
      clearTimeout(timeout)
      if (!resolved) { resolved = true; resolve(null) }
    })

    ws.on("close", () => {
      clearTimeout(timeout)
      if (!resolved) { resolved = true; resolve(fullReply.trim() || null) }
    })
  })
}

export const elevenlabsClient = { sendMessage }
