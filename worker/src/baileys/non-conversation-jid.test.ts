import { describe, it, expect } from "vitest"
import { isNonConversationJid } from "./event-handlers.js"

describe("isNonConversationJid", () => {
  // Channels are deliberately NOT filtered: the owner chose to keep answering
  // them, with the replies charged at the normal per-message rate.
  it("lets WhatsApp Channel posts through", () => {
    expect(isNonConversationJid("120363427096600903@newsletter")).toBe(false)
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
      "120363427096600903@newsletter",
    ]) {
      expect(isNonConversationJid(jid)).toBe(false)
    }
  })

  it("matches on the suffix, not a substring", () => {
    expect(isNonConversationJid("newsletter@s.whatsapp.net")).toBe(false)
  })
})
