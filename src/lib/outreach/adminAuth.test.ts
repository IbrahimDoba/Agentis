import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"

// Auth code, so the boundary is pinned rather than assumed. Session paths are
// covered by withAuth's own tests; these cover the token path this file adds.

vi.mock("@/lib/auth", () => ({ auth: async () => null }))

const TOKEN = "a".repeat(32)
const original = process.env.OUTREACH_ADMIN_TOKEN

function reqWith(header?: string) {
  return { headers: { get: (k: string) => (k === "authorization" ? header ?? null : null) } } as never
}

beforeEach(() => vi.resetModules())
afterEach(() => {
  if (original === undefined) delete process.env.OUTREACH_ADMIN_TOKEN
  else process.env.OUTREACH_ADMIN_TOKEN = original
})

async function load(token?: string) {
  vi.resetModules()
  if (token === undefined) delete process.env.OUTREACH_ADMIN_TOKEN
  else process.env.OUTREACH_ADMIN_TOKEN = token
  return import("./adminAuth")
}

describe("authorizeOutreachAdmin", () => {
  it("accepts the configured token", async () => {
    const m = await load(TOKEN)
    expect(await m.authorizeOutreachAdmin(reqWith(`Bearer ${TOKEN}`))).toEqual({ kind: "token" })
  })

  it("rejects a wrong token", async () => {
    const m = await load(TOKEN)
    expect(await m.authorizeOutreachAdmin(reqWith(`Bearer ${"b".repeat(32)}`))).toBeNull()
  })

  it("rejects when no token is configured, even if one is presented", async () => {
    // Unset must mean session-only. A deployment that never sets this should not
    // gain a second way in.
    const m = await load(undefined)
    expect(await m.authorizeOutreachAdmin(reqWith(`Bearer ${TOKEN}`))).toBeNull()
  })

  it("refuses a short configured token rather than trusting it", async () => {
    const m = await load("tooshort")
    expect(await m.authorizeOutreachAdmin(reqWith("Bearer tooshort"))).toBeNull()
  })

  it("rejects an empty bearer value", async () => {
    const m = await load(TOKEN)
    expect(await m.authorizeOutreachAdmin(reqWith("Bearer "))).toBeNull()
  })

  it("does not compare lengths by throwing", async () => {
    // timingSafeEqual throws on mismatched buffers; a thrown error here would
    // surface as a 500 rather than a refusal.
    const m = await load(TOKEN)
    await expect(m.authorizeOutreachAdmin(reqWith("Bearer short"))).resolves.toBeNull()
  })

  it("falls through to the session when there is no bearer header", async () => {
    // auth() is mocked to null, so this is the signed-out case.
    const m = await load(TOKEN)
    expect(await m.authorizeOutreachAdmin(reqWith(undefined))).toBeNull()
  })

  it("labels a token actor distinctly from a person", async () => {
    const m = await load(TOKEN)
    expect(m.actorLabel({ kind: "token" })).toBe("api-token")
    expect(m.actorLabel({ kind: "session", email: "a@b.com" })).toBe("a@b.com")
  })
})
