import { describe, it, expect } from "vitest"
import { isNonConversationJid } from "./event-handlers.js"

describe("isNonConversationJid", () => {
  // WhatsApp Channels arrive through the same event as real chats. Before this
  // filter they became conversations and the AI answered them.
  it("ignores WhatsApp Channel posts", () => {
    expect(isNonConversationJid("120363427096600903@newsletter")).toBe(true)
  })

  it("ignores status and broadcast posts", () => {
    expect(isNonConversationJid("status@broadcast")).toBe(true)
    expect(isNonConversationJid("120363043211234567@broadcast")).toBe(true)
  })

  it("still accepts real chats", () => {
    for (const jid of [
      "2348031234567@s.whatsapp.net",
      "98765432109876@lid",
      "120363410473847853@g.us",
    ]) {
      expect(isNonConversationJid(jid)).toBe(false)
    }
  })

  it("matches on the suffix, not a substring", () => {
    expect(isNonConversationJid("newsletter@s.whatsapp.net")).toBe(false)
  })
})
