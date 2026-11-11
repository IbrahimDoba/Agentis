import { describe, it, expect } from "vitest"
import { isJunkName, savedName, contactSaveArgs, addressBookEntries, capDay, isFreeAccount, freeSavesLeft, FREE_SAVE_LIMIT } from "./contact-save.js"

describe("isJunkName", () => {
  it("rejects names that aren't names", () => {
    for (const n of ["H", "🔥", ".", `*"'`, "22577", "+234 803", "Typing......", "", "   ", null]) {
      expect(isJunkName(n)).toBe(true)
    }
  })

  it("keeps real names, including business names and non-Latin scripts", () => {
    for (const n of ["Adegoke Abdulrahman", "Felicia@Elblingscouture", "Ib_doba🐐📿", "Ngozi Beauty VIP", "Мария", "Jo"]) {
      expect(isJunkName(n)).toBe(false)
    }
  })
})

describe("savedName", () => {
  it("appends the tag with a space", () => {
    expect(savedName("Ada Obi", "- DZ")).toBe("Ada Obi - DZ")
    expect(savedName("Ada Obi", "· DZ")).toBe("Ada Obi · DZ")
  })

  it("saves the plain name when there is no tag", () => {
    expect(savedName("  Ada   Obi ", null)).toBe("Ada Obi")
    expect(savedName("Ada", "  ")).toBe("Ada")
  })

  it("caps very long push names before the tag", () => {
    expect(savedName("x".repeat(100), "DZ")).toBe(`${"x".repeat(60)} DZ`)
  })
})

describe("contactSaveArgs", () => {
  it("targets the phone's address book, not just WhatsApp", () => {
    const { jid, contact } = contactSaveArgs("2348031234567", "Ada Obi", "- DZ")
    expect(jid).toBe("2348031234567@s.whatsapp.net")
    expect(contact).toEqual({
      fullName: "Ada Obi - DZ",
      firstName: "Ada",
      pnJid: "2348031234567@s.whatsapp.net",
      saveOnPrimaryAddressbook: true,
    })
  })
})

describe("addressBookEntries", () => {
  const resolve = (jid: string) => (jid === "111@lid" ? "2348000000001" : jid.split("@")[0])

  it("keeps only contacts with an owner-saved name", () => {
    const out = addressBookEntries(
      [
        { id: "2348031234567@s.whatsapp.net", name: "Ada" },
        { id: "2348031234568@s.whatsapp.net", notify: "Bayo (push name only)" },
        { id: "123@g.us", name: "Some group" },
      ],
      resolve,
    )
    expect(out).toEqual([{ phone: "2348031234567", name: "Ada" }])
  })

  it("maps LID contacts via phoneNumber, then the resolver", () => {
    const out = addressBookEntries(
      [
        { id: "999@lid", phoneNumber: "2348031234569@s.whatsapp.net", name: "Chidi" },
        { id: "111@lid", name: "Dayo" },
        { id: "222@lid", name: "Unmapped" },
      ],
      resolve,
    )
    expect(out).toEqual([
      { phone: "2348031234569", name: "Chidi" },
      { phone: "2348000000001", name: "Dayo" },
    ])
  })
})

describe("capDay", () => {
  it("rolls over at midnight Lagos time", () => {
    // 22:30 UTC = 23:30 Lagos, still 1 Nov
    const late = Date.UTC(2026, 10, 1, 22, 30)
    expect(capDay(late)).toEqual({ key: "2026-11-01", endsAt: Date.UTC(2026, 10, 1, 23, 0) })
    // 23:30 UTC = 00:30 Lagos, already 2 Nov
    expect(capDay(Date.UTC(2026, 10, 1, 23, 30)).key).toBe("2026-11-02")
  })
})

describe("isFreeAccount", () => {
  const now = Date.UTC(2026, 10, 10)
  const future = new Date(now + 86_400_000)
  const past = new Date(now - 86_400_000)

  it("treats a trial with no wallet as free, active or not started", () => {
    expect(isFreeAccount({ plan: "free", subscriptionExpiresAt: future, wallet: 0, now })).toBe(true)
    expect(isFreeAccount({ plan: "free", subscriptionExpiresAt: null, wallet: 0, now })).toBe(true)
    expect(isFreeAccount({ plan: null, subscriptionExpiresAt: null, wallet: 0, now })).toBe(true)
  })

  it("treats a funded pay-as-you-go wallet as paying, even on plan free", () => {
    expect(isFreeAccount({ plan: "free", subscriptionExpiresAt: past, wallet: 50, now })).toBe(false)
  })

  it("treats a live paid or reseller plan as paying", () => {
    expect(isFreeAccount({ plan: "basic", subscriptionExpiresAt: future, wallet: 0, now })).toBe(false)
    expect(isFreeAccount({ plan: "reseller", subscriptionExpiresAt: null, wallet: 0, now })).toBe(false)
  })

  it("treats a lapsed paid plan with no wallet as free", () => {
    expect(isFreeAccount({ plan: "starter", subscriptionExpiresAt: past, wallet: 0, now })).toBe(true)
  })
})

describe("freeSavesLeft", () => {
  it("counts down to zero and never goes negative", () => {
    expect(freeSavesLeft(true, 0)).toBe(FREE_SAVE_LIMIT)
    expect(freeSavesLeft(true, 150)).toBe(50)
    expect(freeSavesLeft(true, 260)).toBe(0)
  })

  it("has no limit for paying accounts", () => {
    expect(freeSavesLeft(false, 5000)).toBeNull()
  })
})
