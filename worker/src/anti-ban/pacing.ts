import type { WASocket } from "@whiskeysockets/baileys"
import { truncatedNormal } from "./distribution.js"
import { getTierConfig } from "./warmup.js"
import { logger as rootLogger } from "../lib/logger.js"

const logger = rootLogger.child({ module: "pacing" })

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

/**
 * §7.2 — Typing indicator duration proportional to message length.
 * min 800ms, max 4000ms.
 */
function typingDuration(text: string): number {
  return Math.min(4000, Math.max(800, text.length * 40))
}

/**
 * Send a message with human-like pacing:
 * 1. Send composing presence
 * 2. Wait proportional to message length
 * 3. Send message
 * 4. Send paused presence
 * 5. Apply inter-message delay from tier config
 */
export async function sendWithPacing(
  sock: WASocket,
  jid: string,
  text: string,
  warmupTier: number
): Promise<string | undefined> {
  const tier = getTierConfig(warmupTier)

  // §7.2 — Typing indicator
  try {
    await sock.sendPresenceUpdate("composing", jid)
  } catch (err) {
    logger.debug({ err }, "Failed to send composing presence")
  }

  await sleep(typingDuration(text))

  // Send the actual message — capture key ID for dedup cache
  const sent = await sock.sendMessage(jid, { text })
  const msgId = sent?.key?.id

  // §7.2 — Paused presence
  try {
    await sock.sendPresenceUpdate("paused", jid)
  } catch {
    // Non-critical
  }

  // §7.3 — Inter-message delay (truncated normal distribution)
  const delay = truncatedNormal(tier.minDelayMs, tier.maxDelayMs)
  logger.debug({ jid, delay, tier: warmupTier }, "Pacing delay applied")
  await sleep(delay)

  return msgId
}

/**
 * Send an image with human-like pacing (composing indicator before send).
 */
export async function sendImageWithPacing(
  sock: WASocket,
  jid: string,
  imageUrl: string,
  caption: string,
  warmupTier: number
): Promise<string | undefined> {
  const tier = getTierConfig(warmupTier)

  try {
    await sock.sendPresenceUpdate("composing", jid)
  } catch (err) {
    logger.debug({ err }, "Failed to send composing presence")
  }

  // Fixed delay simulating the time to "look up" and send the image
  await sleep(1500)

  const sent = await sock.sendMessage(jid, {
    image: { url: imageUrl },
    caption: caption || undefined,
  })
  const msgId = sent?.key?.id

  try {
    await sock.sendPresenceUpdate("paused", jid)
  } catch {
    // Non-critical
  }

  const delay = truncatedNormal(tier.minDelayMs, tier.maxDelayMs)
  logger.debug({ jid, delay, tier: warmupTier }, "Pacing delay applied after image send")
  await sleep(delay)

  return msgId
}

/**
 * §7.6 — Check if current time is within business hours.
 * start/end are "HH:MM" strings. timezone is IANA timezone name.
 * Returns { inHours, extraDelayMs } — extra delay applied outside hours.
 */
export function businessHoursCheck(
  start: string,
  end: string,
  timezone: string
): { inHours: boolean; extraDelayMs: number } {
  try {
    const now = new Date()
    const formatter = new Intl.DateTimeFormat("en-GB", {
      timeZone: timezone,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    })
    const localTime = formatter.format(now) // "HH:MM"

    const toMinutes = (t: string) => {
      const [h, m] = t.split(":").map(Number)
      return h * 60 + m
    }

    const current = toMinutes(localTime)
    const startM = toMinutes(start)
    const endM = toMinutes(end)
    const inHours = current >= startM && current < endM

    const extraDelayMs = inHours ? 0 : truncatedNormal(30_000, 120_000)
    return { inHours, extraDelayMs }
  } catch {
    return { inHours: true, extraDelayMs: 0 }
  }
}
