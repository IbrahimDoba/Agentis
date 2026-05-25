import { getRedis } from "../queue/redis.js"
import { logger as rootLogger } from "./logger.js"

const logger = rootLogger.child({ module: "sse-publish" })

// Must match the Next.js SSE store contract (src/lib/sse-store.ts):
//   channel: "sse:events"
//   message: JSON { agentId, event, data }
const SSE_CHANNEL = "sse:events"

/**
 * Publish a dashboard real-time event to the shared SSE channel. Best-effort —
 * a failure here must never affect message processing, so we swallow + log.
 */
export async function publishSseEvent(
  agentId: string,
  event: string,
  data: unknown
): Promise<void> {
  try {
    await getRedis().publish(SSE_CHANNEL, JSON.stringify({ agentId, event, data }))
  } catch (err) {
    logger.warn({ err, agentId, event }, "Failed to publish SSE event")
  }
}
