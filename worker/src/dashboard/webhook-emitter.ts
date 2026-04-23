import { createHmac } from "crypto"
import { config } from "../config.js"
import { logger as rootLogger } from "../lib/logger.js"

const logger = rootLogger.child({ module: "webhook-emitter" })

type WorkerEvent =
  | "session.qr"
  | "session.connected"
  | "session.disconnected"
  | "session.banned"
  | "message.inbound"
  | "message.sent"
  | "message.failed"

function sign(body: string): string {
  return createHmac("sha256", config.DASHBOARD_WEBHOOK_SECRET).update(body).digest("hex")
}

async function sendWebhook(event: WorkerEvent, data: unknown): Promise<void> {
  const payload = JSON.stringify({ event, data, timestamp: Date.now() })
  const signature = sign(payload)

  try {
    const res = await fetch(`${config.DASHBOARD_URL}/api/baileys/events`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Baileys-Signature": signature,
      },
      body: payload,
      signal: AbortSignal.timeout(5000),
    })

    if (!res.ok) {
      logger.warn({ event, status: res.status }, "Dashboard webhook returned non-2xx")
    }
  } catch (err) {
    logger.warn({ event, err }, "Failed to deliver dashboard webhook")
  }
}

async function sendBanAlert(agentId: string): Promise<void> {
  if (!config.ALERT_WEBHOOK_URL) return
  try {
    await fetch(config.ALERT_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: `🚨 *Baileys ban detected* — agentId: \`${agentId}\`\nSession has been stopped. Check the dashboard immediately.`,
      }),
    })
  } catch {
    // Non-critical
  }
}

export const webhookEmitter = {
  emit(event: WorkerEvent, data: unknown): void {
    // Fire-and-forget
    void sendWebhook(event, data)

    // Extra: send ban alert to Slack/Discord
    if (event === "session.banned") {
      void sendBanAlert((data as { agentId: string }).agentId)
    }
  },
}
