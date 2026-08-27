import { describe, it, expect } from "vitest"
import { inboundSchema } from "./inbound.js"

// Imports the REAL schema. The bug this guards against was not a schema bug —
// the fields were declared correctly but dropped by the route's explicit
// destructure, so a group reply lost its groupJid and got DM'd to whoever
// tagged the bot instead of going back to the group.
const groupPayload = {
  agentId: "agent-1",
  messageId: "MSG-1",
  fromPhone: "120363410473847853@g.us",
  senderJid: "2348091119516@s.whatsapp.net",
  text: "@67075225694335 hi",
  timestamp: 1787840445000,
  channel: "whatsapp_group" as const,
  groupJid: "120363410473847853@g.us",
  senderName: "Ib_doba",
}

describe("inbound payload contract", () => {
  it("accepts a group message", () => {
    const parsed = inboundSchema.safeParse(groupPayload)
    expect(parsed.success).toBe(true)
  })

  it("carries groupJid and senderName through parsing", () => {
    const parsed = inboundSchema.parse(groupPayload)
    expect(parsed.groupJid).toBe("120363410473847853@g.us")
    expect(parsed.senderName).toBe("Ib_doba")
  })

  it("still accepts a plain 1:1 message with neither field", () => {
    const { channel: _c, groupJid: _g, senderName: _s, ...dm } = groupPayload
    const parsed = inboundSchema.safeParse({ ...dm, fromPhone: "2348091119516" })
    expect(parsed.success).toBe(true)
  })
})

// The route destructures parsed.data field-by-field and rebuilds the queue
// payload. Anything omitted there is silently dropped — which is exactly how
// groupJid went missing. Assert the two shapes stay in step.
describe("route destructure does not drop group fields", () => {
  it("enqueues every field the schema accepts", () => {
    const parsed = inboundSchema.parse(groupPayload)
    const { agentId, messageId, fromPhone, senderJid, text, timestamp, pushName, channel, groupJid, senderName } = parsed
    const enqueued = { agentId, messageId, fromPhone, senderJid, text, timestamp, pushName, channel, groupJid, senderName }

    for (const key of Object.keys(groupPayload) as (keyof typeof groupPayload)[]) {
      expect(enqueued, `"${key}" was dropped between parse and enqueue`).toHaveProperty(key)
      expect(enqueued[key]).toEqual(groupPayload[key])
    }
  })
})
