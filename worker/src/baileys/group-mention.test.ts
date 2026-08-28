import { describe, it, expect } from "vitest"
import type { WAMessage } from "@whiskeysockets/baileys"
import { isAddressedToUs, bareUser, resolveSelfJids, addressingDebug } from "./group-mention.js"

const SELF_PN = "2348031234567:12@s.whatsapp.net"
const SELF_LID = "98765432109876@lid"
const SELF = [SELF_PN, SELF_LID]

const never = () => false
const always = () => true

function textMsg(contextInfo: Record<string, unknown> | null): WAMessage {
  return {
    key: { remoteJid: "120363043211234567@g.us", id: "ABC", fromMe: false },
    message: contextInfo
      ? { extendedTextMessage: { text: "hi", contextInfo } }
      : { conversation: "hi" },
  } as unknown as WAMessage
}

describe("bareUser", () => {
  it("strips the device suffix and domain", () => {
    expect(bareUser("2348031234567:12@s.whatsapp.net")).toBe("2348031234567")
    expect(bareUser("98765432109876@lid")).toBe("98765432109876")
  })

  it("returns null for empty input", () => {
    expect(bareUser(null)).toBeNull()
    expect(bareUser(undefined)).toBeNull()
    expect(bareUser("")).toBeNull()
  })
})

describe("isAddressedToUs", () => {
  it("detects a mention by phone JID", () => {
    const msg = textMsg({ mentionedJid: ["2348031234567@s.whatsapp.net"] })
    expect(isAddressedToUs(msg, SELF, never)).toBe(true)
  })

  it("detects a mention by LID", () => {
    const msg = textMsg({ mentionedJid: ["98765432109876@lid"] })
    expect(isAddressedToUs(msg, SELF, never)).toBe(true)
  })

  it("detects a reply to one of our messages", () => {
    const msg = textMsg({ stanzaId: "SENT-BY-US" })
    expect(isAddressedToUs(msg, SELF, (id) => id === "SENT-BY-US")).toBe(true)
  })

  it("detects a quote whose author is us even without mentionedJid", () => {
    const msg = textMsg({ stanzaId: "X", participant: SELF_LID })
    expect(isAddressedToUs(msg, SELF, never)).toBe(true)
  })

  it("ignores a reply to someone else's message", () => {
    const msg = textMsg({ stanzaId: "OTHER", participant: "2348039999999@s.whatsapp.net" })
    expect(isAddressedToUs(msg, SELF, never)).toBe(false)
  })

  it("ignores a mention of a different participant", () => {
    const msg = textMsg({ mentionedJid: ["2348039999999@s.whatsapp.net"] })
    expect(isAddressedToUs(msg, SELF, never)).toBe(false)
  })

  it("ignores a plain message with no contextInfo", () => {
    expect(isAddressedToUs(textMsg(null), SELF, always)).toBe(false)
  })

  it("returns false when we do not know our own identity", () => {
    const msg = textMsg({ mentionedJid: ["2348031234567@s.whatsapp.net"] })
    expect(isAddressedToUs(msg, [null, undefined], never)).toBe(false)
  })

  it("reads contextInfo off an image caption", () => {
    const msg = {
      key: { remoteJid: "120363043211234567@g.us", id: "IMG", fromMe: false },
      message: { imageMessage: { caption: "look", contextInfo: { mentionedJid: [SELF_LID] } } },
    } as unknown as WAMessage
    expect(isAddressedToUs(msg, SELF, never)).toBe(true)
  })
})

describe("resolveSelfJids", () => {
  // The prod failure: sock.user.lid was absent, the group tagged us by LID, and
  // the mention never matched — the bot ignored everyone with nothing in the log.
  it("resolves our LID from the signal mapping when sock.user.lid is missing", async () => {
    const sock = {
      user: { id: "2348149113328:7@s.whatsapp.net" },
      signalRepository: {
        lidMapping: {
          getLIDForPN: async (pn: string) =>
            pn === "2348149113328@s.whatsapp.net" ? "98765432109876@lid" : null,
        },
      },
    } as never

    const jids = await resolveSelfJids(sock)
    expect(jids).toContain("98765432109876@lid")

    const tagged = {
      key: { remoteJid: "120363043211234567@g.us", id: "X", fromMe: false },
      message: { extendedTextMessage: { text: "hi", contextInfo: { mentionedJid: ["98765432109876@lid"] } } },
    } as never
    expect(isAddressedToUs(tagged, jids, () => false)).toBe(true)
  })

  it("survives a socket with no mapping available", async () => {
    const sock = { user: { id: "2348149113328:7@s.whatsapp.net" } } as never
    expect(await resolveSelfJids(sock)).toEqual(["2348149113328:7@s.whatsapp.net"])
  })

  it("does not cache an empty result", async () => {
    const sock = { user: undefined } as never
    expect(await resolveSelfJids(sock)).toEqual([])
    ;(sock as { user?: unknown }).user = { id: "234@s.whatsapp.net" }
    expect(await resolveSelfJids(sock)).toEqual(["234@s.whatsapp.net"])
  })
})

describe("addressingDebug", () => {
  it("surfaces the mention fields a drop was based on", () => {
    const msg = {
      key: { remoteJid: "120363043211234567@g.us", id: "X", fromMe: false },
      message: { extendedTextMessage: { text: "hi", contextInfo: { mentionedJid: ["999@lid"] } } },
    } as never
    expect(addressingDebug(msg)).toMatchObject({ mentionedJid: ["999@lid"] })
  })
})
