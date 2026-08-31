import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"

// The guard is the last thing standing between a cold campaign and the domain
// that carries every verification code. Sending from the root IS allowed here,
// but only deliberately — so the exact boundary of that opt-in is worth pinning.

const ENV_KEYS = [
  "OUTREACH_FROM_EMAIL",
  "OUTREACH_ALLOW_ROOT_DOMAIN",
  "OUTREACH_TRANSPORT",
  "OUTREACH_SMTP_HOST",
  "OUTREACH_SMTP_USER",
  "OUTREACH_SMTP_PASSWORD",
] as const

const original: Record<string, string | undefined> = {}

beforeEach(() => {
  vi.resetModules()
  for (const key of ENV_KEYS) {
    original[key] = process.env[key]
    delete process.env[key]
  }
})

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (original[key] === undefined) delete process.env[key]
    else process.env[key] = original[key]
  }
})

async function loadWith(env: Partial<Record<(typeof ENV_KEYS)[number], string>>) {
  vi.resetModules()
  for (const [key, value] of Object.entries(env)) process.env[key] = value
  return import("./send")
}

describe("assertOutreachConfigured", () => {
  it("refuses the root domain without the explicit opt-in", async () => {
    const { assertOutreachConfigured } = await loadWith({ OUTREACH_FROM_EMAIL: "ibrahimdoba@dailzero.com" })
    expect(() => assertOutreachConfigured()).toThrow(/OUTREACH_ALLOW_ROOT_DOMAIN/)
  })

  it("allows the root domain once opted in", async () => {
    const mod = await loadWith({
      OUTREACH_FROM_EMAIL: "ibrahimdoba@dailzero.com",
      OUTREACH_ALLOW_ROOT_DOMAIN: "true",
    })
    expect(mod.assertOutreachConfigured()).toBe("ibrahimdoba@dailzero.com")
    expect(mod.isRootSender()).toBe(true)
  })

  it("treats anything other than the literal 'true' as not opted in", async () => {
    const { assertOutreachConfigured } = await loadWith({
      OUTREACH_FROM_EMAIL: "ibrahimdoba@dailzero.com",
      OUTREACH_ALLOW_ROOT_DOMAIN: "yes",
    })
    expect(() => assertOutreachConfigured()).toThrow(/OUTREACH_ALLOW_ROOT_DOMAIN/)
  })

  it("covers www of the root, which is the same reputation", async () => {
    const { assertOutreachConfigured } = await loadWith({ OUTREACH_FROM_EMAIL: "ope@www.dailzero.com" })
    expect(() => assertOutreachConfigured()).toThrow(/OUTREACH_ALLOW_ROOT_DOMAIN/)
  })

  it("is case-insensitive, so a shouty env var cannot slip the root through", async () => {
    const { assertOutreachConfigured } = await loadWith({ OUTREACH_FROM_EMAIL: "Ope@DailZero.COM" })
    expect(() => assertOutreachConfigured()).toThrow(/OUTREACH_ALLOW_ROOT_DOMAIN/)
  })

  it("allows a subdomain with no opt-in needed", async () => {
    const mod = await loadWith({ OUTREACH_FROM_EMAIL: "ope@go.dailzero.com" })
    expect(mod.assertOutreachConfigured()).toBe("ope@go.dailzero.com")
    expect(mod.isSubdomainSender()).toBe(true)
    expect(mod.isRootSender()).toBe(false)
  })

  it("allows a wholly separate domain", async () => {
    const mod = await loadWith({ OUTREACH_FROM_EMAIL: "ope@trydailzero.com" })
    expect(mod.assertOutreachConfigured()).toBe("ope@trydailzero.com")
    expect(mod.isSubdomainSender()).toBe(false)
  })

  it("rejects noreply@, which belongs to the transactional sender", async () => {
    const { assertOutreachConfigured } = await loadWith({
      OUTREACH_FROM_EMAIL: "noreply@dailzero.com",
      OUTREACH_ALLOW_ROOT_DOMAIN: "true",
    })
    expect(() => assertOutreachConfigured()).toThrow(/noreply@/)
  })

  it("refuses when unset or domainless rather than defaulting anywhere", async () => {
    const unset = await loadWith({})
    expect(() => unset.assertOutreachConfigured()).toThrow(/is not set/)

    const bad = await loadWith({ OUTREACH_FROM_EMAIL: "ope@localhost" })
    expect(() => bad.assertOutreachConfigured()).toThrow(/no valid domain/)
  })

  it("requires the SMTP settings when the zoho transport is selected", async () => {
    const missing = await loadWith({
      OUTREACH_FROM_EMAIL: "ibrahimdoba@dailzero.com",
      OUTREACH_ALLOW_ROOT_DOMAIN: "true",
      OUTREACH_TRANSPORT: "zoho-smtp",
    })
    expect(() => missing.assertOutreachConfigured()).toThrow(/OUTREACH_SMTP_HOST/)

    const complete = await loadWith({
      OUTREACH_FROM_EMAIL: "ibrahimdoba@dailzero.com",
      OUTREACH_ALLOW_ROOT_DOMAIN: "true",
      OUTREACH_TRANSPORT: "zoho-smtp",
      OUTREACH_SMTP_HOST: "smtppro.zoho.com",
      OUTREACH_SMTP_USER: "ibrahimdoba@dailzero.com",
      OUTREACH_SMTP_PASSWORD: "app-specific",
    })
    expect(complete.assertOutreachConfigured()).toBe("ibrahimdoba@dailzero.com")
  })
})
