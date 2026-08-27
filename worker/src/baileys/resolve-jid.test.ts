import { describe, it, expect } from "vitest"
import type { WASocket } from "@whiskeysockets/baileys"
import { resolveSendJid } from "./resolve-jid.js"

// A socket that would fail the send if we ever reached the phone-JID path —
// onWhatsApp returning [] means "not on WhatsApp", i.e. null.
const socket = { onWhatsApp: async () => [] } as unknown as WASocket

describe("resolveSendJid", () => {
  it("returns a group JID unchanged", async () => {
    const jid = "120363043211234567@g.us"
    expect(await resolveSendJid(socket, jid)).toBe(jid)
  })

  it("returns a LID unchanged", async () => {
    const jid = "123456789012345@lid"
    expect(await resolveSendJid(socket, jid)).toBe(jid)
  })

  it("routes a 15+ digit phone-suffixed id as a LID", async () => {
    expect(await resolveSendJid(socket, "123456789012345@s.whatsapp.net")).toBe("123456789012345@lid")
  })

  it("returns null when a real phone number is not on WhatsApp", async () => {
    expect(await resolveSendJid(socket, "2348031234567@s.whatsapp.net")).toBeNull()
  })

  it("returns null without a socket", async () => {
    expect(await resolveSendJid(null, "120363043211234567@g.us")).toBeNull()
  })
})
