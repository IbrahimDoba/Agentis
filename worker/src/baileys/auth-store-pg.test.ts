import { describe, it, expect, vi } from "vitest"

// crypto: identity passthrough so serialize/deserialize exercise only the
// BufferJSON round-trip (real AES needs a 32-byte key from env).
vi.mock("../lib/crypto.js", () => ({
  encrypt: (b: Buffer | string) => (Buffer.isBuffer(b) ? b : Buffer.from(b, "utf8")),
  decrypt: (b: Buffer) => b,
}))
vi.mock("../config.js", () => ({ config: { AUTH_STORAGE_DIR: "/tmp/pg-auth-test", AUTH_STORE: "postgres" } }))
vi.mock("../lib/logger.js", () => {
  const noop = () => {}
  const child = () => ({ info: noop, warn: noop, error: noop, debug: noop, child })
  return { logger: child() }
})
// db/client is imported at module load but unused by the pure helpers under test.
vi.mock("../db/client.js", () => ({ sql: Object.assign(() => {}, { begin: async () => {} }) }))

import { fixId, parseFileName, serialize, deserialize } from "./auth-store-pg.js"

describe("fixId", () => {
  it("mirrors Baileys fixFileName: / → __ and : → -", () => {
    expect(fixId("foo/bar")).toBe("foo__bar")
    expect(fixId("group::user::1")).toBe("group--user--1")
    expect(fixId("2348123456789.0")).toBe("2348123456789.0") // plain ids untouched
  })
})

describe("parseFileName", () => {
  it("maps creds.json", () => {
    expect(parseFileName("creds.json")).toEqual({ category: "creds", keyId: "creds" })
  })
  it("maps pre-key and session files", () => {
    expect(parseFileName("pre-key-5.json")).toEqual({ category: "pre-key", keyId: "5" })
    expect(parseFileName("session-2348123456789.0.json")).toEqual({
      category: "session",
      keyId: "2348123456789.0",
    })
  })
  it("disambiguates sender-key-memory from sender-key (longest prefix wins)", () => {
    expect(parseFileName("sender-key-memory-abc.json")).toEqual({
      category: "sender-key-memory",
      keyId: "abc",
    })
    expect(parseFileName("sender-key-xyz.json")).toEqual({ category: "sender-key", keyId: "xyz" })
  })
  it("maps app-state-sync-key / version", () => {
    expect(parseFileName("app-state-sync-key-AAAA.json")).toEqual({
      category: "app-state-sync-key",
      keyId: "AAAA",
    })
    expect(parseFileName("app-state-sync-version-critical_block.json")).toEqual({
      category: "app-state-sync-version",
      keyId: "critical_block",
    })
  })
  it("ignores non-json and unknown files", () => {
    expect(parseFileName("notes.txt")).toBeNull()
    expect(parseFileName("mystery-1.json")).toBeNull()
  })
})

describe("serialize / deserialize round-trip", () => {
  it("preserves plain objects", () => {
    const v = { registered: true, nextPreKeyId: 42, name: "x" }
    expect(deserialize(serialize(v))).toEqual(v)
  })
  it("preserves Buffers via BufferJSON", () => {
    const v = { key: Buffer.from([1, 2, 3, 4, 250]), nested: { b: Buffer.from("hello") } }
    const out = deserialize<typeof v>(serialize(v))
    expect(Buffer.isBuffer(out.key)).toBe(true)
    expect(Buffer.from(out.key).equals(Buffer.from([1, 2, 3, 4, 250]))).toBe(true)
    expect(Buffer.from(out.nested.b).toString()).toBe("hello")
  })
})
