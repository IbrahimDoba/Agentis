import { describe, it, expect, beforeAll, afterAll } from "vitest"
import bcrypt from "bcryptjs"
import { db } from "@/lib/db"
import {
  API_KEY_PREFIX,
  API_KEY_SCOPES,
  isApiKeyScope,
  generateApiKey,
  verifyApiKey,
  revokeApiKey,
  recordApiKeySpend,
  createApiKey,
  listApiKeysForUser,
  revokeApiKeyForUser,
  isApiKeyDailyCapExceeded,
} from "./apiKey"

// Real-DB tests: seed a throwaway user, persist generated keys against it, and
// clean everything up afterwards.
describe("apiKey (real DB)", () => {
  let userId: string
  const email = `vitest-apikey-${Date.now()}@example.test`

  beforeAll(async () => {
    const u = await db.user.create({
      data: { email, name: "vitest apikey user", businessName: "vitest co" },
      select: { id: true },
    })
    userId = u.id
  })

  afterAll(async () => {
    await db.apiKey.deleteMany({ where: { userId } })
    await db.user.deleteMany({ where: { id: userId } })
  })

  // Persist a freshly generated key for the test user.
  async function persistKey(opts?: { scopes?: string[]; cap?: number | null }) {
    const gen = await generateApiKey()
    const row = await db.apiKey.create({
      data: {
        userId,
        name: "test key",
        prefix: gen.prefix,
        hashedKey: gen.hash,
        scopes: opts?.scopes ?? ["chat"],
        dailySpendingCapCredits: opts?.cap ?? null,
      },
      select: { id: true },
    })
    return { raw: gen.raw, id: row.id, prefix: gen.prefix }
  }

  describe("generateApiKey", () => {
    it("produces a dz_live_ key whose hash verifies and is not the raw", async () => {
      const gen = await generateApiKey()
      expect(gen.raw.startsWith(API_KEY_PREFIX)).toBe(true)
      expect(gen.prefix.startsWith(API_KEY_PREFIX)).toBe(true)
      expect(gen.raw.startsWith(gen.prefix)).toBe(true)
      expect(gen.raw).not.toEqual(gen.hash)
      expect(await bcrypt.compare(gen.raw, gen.hash)).toBe(true)
    })

    it("produces a unique raw + prefix each call", async () => {
      const a = await generateApiKey()
      const b = await generateApiKey()
      expect(a.raw).not.toEqual(b.raw)
      expect(a.prefix).not.toEqual(b.prefix)
    })
  })

  describe("verifyApiKey", () => {
    it("returns the row for a valid key", async () => {
      const k = await persistKey()
      const row = await verifyApiKey(k.raw)
      expect(row?.id).toBe(k.id)
    })

    it("returns null for garbage / empty / null input", async () => {
      expect(await verifyApiKey("dz_live_deadbeefxxxxxxxxxxxxxxxxxxxxxxxxxxxx")).toBeNull()
      expect(await verifyApiKey("not-a-key")).toBeNull()
      expect(await verifyApiKey("")).toBeNull()
      expect(await verifyApiKey(null)).toBeNull()
    })

    it("returns null for the right prefix but a tampered secret", async () => {
      const k = await persistKey()
      const tampered = k.prefix + "0".repeat(32)
      expect(await verifyApiKey(tampered)).toBeNull()
    })

    it("returns null once the key is revoked", async () => {
      const k = await persistKey()
      await revokeApiKey(k.id)
      expect(await verifyApiKey(k.raw)).toBeNull()
    })
  })

  describe("recordApiKeySpend", () => {
    it("starts a fresh window on the first charge", async () => {
      const k = await persistKey({ cap: 100 })
      const r = await recordApiKeySpend(k.id, 30)
      expect(r.spent).toBe(30)
      expect(r.cap).toBe(100)
      expect(r.capExceeded).toBe(false)
    })

    it("accumulates within the window and flags cap exceeded", async () => {
      const k = await persistKey({ cap: 50 })
      await recordApiKeySpend(k.id, 40)
      const r = await recordApiKeySpend(k.id, 20)
      expect(r.spent).toBe(60)
      expect(r.capExceeded).toBe(true)
    })

    it("never flags cap exceeded when no cap is set", async () => {
      const k = await persistKey({ cap: null })
      const r = await recordApiKeySpend(k.id, 1_000_000)
      expect(r.cap).toBeNull()
      expect(r.capExceeded).toBe(false)
    })

    it("resets the running total once the window has lapsed", async () => {
      const k = await persistKey({ cap: 100 })
      await recordApiKeySpend(k.id, 40)
      // Force the rolling window into the past.
      await db.apiKey.update({
        where: { id: k.id },
        data: { spendingResetAt: new Date(Date.now() - 1000) },
      })
      const r = await recordApiKeySpend(k.id, 10)
      expect(r.spent).toBe(10)
    })
  })

  describe("revokeApiKey", () => {
    it("sets status to revoked and stamps revokedAt", async () => {
      const k = await persistKey()
      await revokeApiKey(k.id)
      const row = await db.apiKey.findUnique({
        where: { id: k.id },
        select: { status: true, revokedAt: true },
      })
      expect(row?.status).toBe("revoked")
      expect(row?.revokedAt).not.toBeNull()
    })
  })

  describe("createApiKey", () => {
    it("persists a key and returns a raw that verifies back to the record", async () => {
      const { raw, record } = await createApiKey(userId, { name: "my key", scopes: ["chat"] })
      expect(raw.startsWith(API_KEY_PREFIX)).toBe(true)
      expect(record.prefix).toBe(raw.slice(0, API_KEY_PREFIX.length + 8))
      expect(record.scopes).toEqual(["chat"])
      const verified = await verifyApiKey(raw)
      expect(verified?.id).toBe(record.id)
    })

    it("stores the optional daily cap", async () => {
      const { record } = await createApiKey(userId, {
        name: "capped",
        scopes: ["chat", "manage"],
        dailySpendingCapCredits: 500,
      })
      expect(record.dailySpendingCapCredits).toBe(500)
    })
  })

  describe("listApiKeysForUser", () => {
    it("lists the user's keys newest-first and never exposes the hash", async () => {
      await createApiKey(userId, { name: "list-me", scopes: ["chat"] })
      const list = await listApiKeysForUser(userId)
      expect(list.length).toBeGreaterThan(0)
      expect((list[0] as unknown as Record<string, unknown>).hashedKey).toBeUndefined()
      // newest-first ordering
      const times = list.map((k) => k.createdAt.getTime())
      expect(times).toEqual([...times].sort((a, b) => b - a))
    })
  })

  describe("revokeApiKeyForUser", () => {
    it("revokes the owner's key but refuses another user's", async () => {
      const { record } = await createApiKey(userId, { name: "k", scopes: ["chat"] })
      expect(await revokeApiKeyForUser("someone-else", record.id)).toBe(false)
      expect(await revokeApiKeyForUser(userId, record.id)).toBe(true)
      const row = await db.apiKey.findUnique({ where: { id: record.id }, select: { status: true } })
      expect(row?.status).toBe("revoked")
    })
  })

  describe("isApiKeyDailyCapExceeded", () => {
    it("is false when no cap is set, even after large spend", async () => {
      const k = await persistKey({ cap: null })
      await recordApiKeySpend(k.id, 1_000_000)
      expect(await isApiKeyDailyCapExceeded(k.id)).toBe(false)
    })

    it("flips to true once spend reaches the cap within the window", async () => {
      const k = await persistKey({ cap: 50 })
      await recordApiKeySpend(k.id, 40)
      expect(await isApiKeyDailyCapExceeded(k.id)).toBe(false)
      await recordApiKeySpend(k.id, 20) // 60 >= 50
      expect(await isApiKeyDailyCapExceeded(k.id)).toBe(true)
    })

    it("is false again once the window lapses", async () => {
      const k = await persistKey({ cap: 50 })
      await recordApiKeySpend(k.id, 60)
      expect(await isApiKeyDailyCapExceeded(k.id)).toBe(true)
      await db.apiKey.update({
        where: { id: k.id },
        data: { spendingResetAt: new Date(Date.now() - 1000) },
      })
      expect(await isApiKeyDailyCapExceeded(k.id)).toBe(false)
    })
  })

  describe("scope helpers", () => {
    it("knows the valid scopes", () => {
      expect(API_KEY_SCOPES).toEqual(["chat", "manage"])
      expect(isApiKeyScope("chat")).toBe(true)
      expect(isApiKeyScope("manage")).toBe(true)
      expect(isApiKeyScope("admin")).toBe(false)
    })
  })
})
