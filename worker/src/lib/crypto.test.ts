import { describe, it, expect, vi, beforeAll } from "vitest"

// Mock config before any imports that trigger dotenv-safe
vi.mock("../config.js", () => ({
  config: {
    AUTH_ENCRYPTION_KEY: Buffer.from("a".repeat(32)).toString("base64"),
    LOG_LEVEL: "silent",
    NODE_ENV: "test",
    PORT: 4000,
    WORKER_API_KEY: "test-key-12345678",
    DASHBOARD_URL: "http://localhost:3000",
    DASHBOARD_WEBHOOK_SECRET: "test-secret-12345678",
    SUPABASE_URL: "http://localhost:54321",
    SUPABASE_SERVICE_ROLE_KEY: "test",
    REDIS_URL: "redis://localhost:6379",
    ELEVENLABS_API_KEY: "test",
    AUTH_STORAGE_BUCKET: "baileys-auth-backups",
    DEFAULT_TIMEZONE: "Africa/Lagos",
    DEFAULT_BUSINESS_HOURS_START: "08:00",
    DEFAULT_BUSINESS_HOURS_END: "21:00",
    ENABLE_WABA_ONBOARDING: false,
  },
}))

const { encrypt, decrypt, safeEqual } = await import("./crypto.js")

describe("encrypt / decrypt roundtrip", () => {
  it("decrypts to original string", () => {
    const original = "Hello, WhatsApp session data!"
    const enc = encrypt(original)
    const dec = decrypt(enc)
    expect(dec.toString("utf8")).toBe(original)
  })

  it("decrypts to original Buffer", () => {
    const original = Buffer.from([1, 2, 3, 4, 5])
    const enc = encrypt(original)
    const dec = decrypt(enc)
    expect(dec).toEqual(original)
  })

  it("produces different ciphertext for same plaintext (random IV)", () => {
    const enc1 = encrypt("same text")
    const enc2 = encrypt("same text")
    expect(enc1.equals(enc2)).toBe(false)
  })

  it("throws on tampered ciphertext", () => {
    const enc = encrypt("secret")
    enc[enc.length - 1] ^= 0xff
    expect(() => decrypt(enc)).toThrow()
  })
})

describe("safeEqual", () => {
  it("returns true for equal strings", () => {
    expect(safeEqual("abc123", "abc123")).toBe(true)
  })

  it("returns false for different strings of same length", () => {
    expect(safeEqual("abc123", "xyz789")).toBe(false)
  })

  it("returns false for different lengths", () => {
    expect(safeEqual("short", "longer-string")).toBe(false)
  })
})
