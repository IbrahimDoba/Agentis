import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { db } from "@/lib/db"
import {
  normalizeName,
  isLikelyLid,
  getCustomerPhonesByName,
  resolveDisplayPhone,
} from "./conversations"

describe("normalizeName", () => {
  it("trims and lowercases", () => {
    expect(normalizeName("  John Doe  ")).toBe("john doe")
  })
  it("handles null/undefined", () => {
    expect(normalizeName(null)).toBe("")
    expect(normalizeName(undefined)).toBe("")
  })
})

describe("isLikelyLid", () => {
  it("treats >13-digit identifiers as LIDs", () => {
    expect(isLikelyLid("123456789012345@lid")).toBe(true)
  })
  it("treats normal phone numbers as non-LID", () => {
    expect(isLikelyLid("2348012345678")).toBe(false) // 13 digits
    expect(isLikelyLid("08012345678")).toBe(false)
  })
  it("strips JID suffix before counting", () => {
    expect(isLikelyLid("2348012345678@s.whatsapp.net")).toBe(false)
  })
})

describe("resolveDisplayPhone", () => {
  const lid = "999888777666555@lid" // 15 digits → LID

  it("prefers the worker-resolved mapping", () => {
    const res = resolveDisplayPhone(
      { phoneNumber: lid, contactName: "Jane" },
      new Map([["jane", new Set(["2348011112222"])]]),
      new Map([[lid, "2349990001111"]])
    )
    expect(res.displayPhoneNumber).toBe("2349990001111")
    expect(res.phoneSource).toBe("worker_lid_mapping")
  })

  it("falls back to a unique customer-name match", () => {
    const res = resolveDisplayPhone(
      { phoneNumber: lid, contactName: "Jane" },
      new Map([["jane", new Set(["2348011112222"])]]),
      new Map()
    )
    expect(res.displayPhoneNumber).toBe("2348011112222")
    expect(res.phoneSource).toBe("customer_name_match")
  })

  it("does NOT name-match when multiple phones share the name (ambiguous)", () => {
    const res = resolveDisplayPhone(
      { phoneNumber: lid, contactName: "Jane" },
      new Map([["jane", new Set(["2348011112222", "2348033334444"])]]),
      new Map()
    )
    expect(res.displayPhoneNumber).toBe(lid)
    expect(res.phoneSource).toBe("conversation")
  })

  it("does NOT name-match a normal (non-LID) phone number", () => {
    const res = resolveDisplayPhone(
      { phoneNumber: "2348012345678", contactName: "Jane" },
      new Map([["jane", new Set(["2348011112222"])]]),
      new Map()
    )
    expect(res.displayPhoneNumber).toBe("2348012345678")
    expect(res.phoneSource).toBe("conversation")
  })
})

describe("getCustomerPhonesByName (real DB)", () => {
  // Seed temporary customers so the case-insensitive match path actually runs,
  // independent of whatever the dev DB happens to hold. Cleaned up afterward.
  const TAG = `vitest-${Date.now()}`
  const NAME = `Test Customer ${TAG}`
  const PHONE_A = `99990001${Date.now().toString().slice(-6)}`
  const PHONE_B = `99990002${Date.now().toString().slice(-6)}`
  let agentId: string

  beforeAll(async () => {
    const agent = await db.agent.findFirst({ select: { id: true } })
    if (!agent) throw new Error("No agent in dev DB — cannot run customer match tests")
    agentId = agent.id
    await db.customer.create({ data: { phoneNumber: PHONE_A, agentId, name: NAME } })
  })

  afterAll(async () => {
    await db.customer.deleteMany({ where: { phoneNumber: { in: [PHONE_A, PHONE_B] } } })
  })

  it("returns an empty map for no contact names (and runs no query)", async () => {
    const map = await getCustomerPhonesByName(db, agentId, [])
    expect(map.size).toBe(0)
  })

  it("returns an empty map when names are all blank", async () => {
    const map = await getCustomerPhonesByName(db, agentId, [null, "", "   "])
    expect(map.size).toBe(0)
  })

  it("finds a customer by exact name", async () => {
    const map = await getCustomerPhonesByName(db, agentId, [NAME])
    expect(map.has(normalizeName(NAME))).toBe(true)
    expect(map.get(normalizeName(NAME))).toContain(PHONE_A)
  })

  it("matches case-insensitively", async () => {
    const map = await getCustomerPhonesByName(db, agentId, [NAME.toUpperCase()])
    expect(map.has(normalizeName(NAME))).toBe(true)
    expect(map.get(normalizeName(NAME))).toContain(PHONE_A)
  })

  it("collapses multiple phones under the same name into one set", async () => {
    await db.customer.create({ data: { phoneNumber: PHONE_B, agentId, name: NAME } })
    const map = await getCustomerPhonesByName(db, agentId, [NAME])
    const set = map.get(normalizeName(NAME))!
    expect(set.size).toBe(2)
    expect(set).toContain(PHONE_A)
    expect(set).toContain(PHONE_B)
  })

  it("does not return customers for unrelated names", async () => {
    const map = await getCustomerPhonesByName(db, agentId, [
      "zzz-this-name-should-not-exist-9f8a7b6c",
    ])
    expect(map.size).toBe(0)
  })
})
