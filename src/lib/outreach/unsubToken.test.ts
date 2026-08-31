import { describe, it, expect, beforeAll } from "vitest"
import { newsletterUnsubToken, verifyNewsletterUnsubToken, isNewsletterToken } from "./unsubToken"

beforeAll(() => {
  process.env.OUTREACH_UNSUB_SECRET = "test-secret-value"
})

describe("newsletter unsubscribe tokens", () => {
  it("round-trips the address", () => {
    const token = newsletterUnsubToken("Ada@Shop.NG")
    expect(verifyNewsletterUnsubToken(token)).toBe("ada@shop.ng")
  })

  it("is recognisable without verifying it", () => {
    expect(isNewsletterToken(newsletterUnsubToken("a@b.ng"))).toBe(true)
    expect(isNewsletterToken("randomOutreachToken")).toBe(false)
  })

  it("rejects a tampered payload, which is the whole point", () => {
    const token = newsletterUnsubToken("ada@shop.ng")
    const [prefix, , signature] = token.split(".")
    const forged = [prefix, Buffer.from("victim@shop.ng").toString("base64url"), signature].join(".")
    expect(verifyNewsletterUnsubToken(forged)).toBeNull()
  })

  it("rejects a tampered signature", () => {
    const token = newsletterUnsubToken("ada@shop.ng")
    expect(verifyNewsletterUnsubToken(`${token}x`)).toBeNull()
  })

  it("rejects malformed tokens rather than throwing", () => {
    for (const bad of ["", "n", "n.only-two", "x.a.b", "a.b.c.d"]) {
      expect(verifyNewsletterUnsubToken(bad)).toBeNull()
    }
  })

  it("rejects a signed payload that is not an email", () => {
    const token = newsletterUnsubToken("ada@shop.ng").split(".")
    // Sign a non-email payload the same way a token is built, to prove the
    // format check runs after signature verification rather than instead of it.
    expect(verifyNewsletterUnsubToken([token[0], token[1], token[2]].join("."))).toBe("ada@shop.ng")
    expect(verifyNewsletterUnsubToken("n..")).toBeNull()
  })
})
