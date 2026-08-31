import { describe, it, expect } from "vitest"
import {
  normalizeEmail,
  emailDomain,
  hashEmail,
  normalizeNgPhone,
  normalizeWebsite,
  normalizeInstagram,
  demoSlug,
  titleCase,
} from "./normalize"

describe("normalizeEmail", () => {
  it("lowercases and trims", () => {
    expect(normalizeEmail("  Info@Shop.NG ")).toBe("info@shop.ng")
  })

  it("strips plus tags on every provider", () => {
    expect(normalizeEmail("sales+lagos@shop.ng")).toBe("sales@shop.ng")
  })

  it("strips dots only for gmail, where they are not significant", () => {
    expect(normalizeEmail("ada.obi@gmail.com")).toBe("adaobi@gmail.com")
    expect(normalizeEmail("ada.obi@shop.ng")).toBe("ada.obi@shop.ng")
  })

  it("rejects anything it cannot confidently parse", () => {
    for (const bad of ["", "no-at-sign", "two@@at.com", "no@tld", "spa ce@x.com", "+tag@x.com"]) {
      expect(normalizeEmail(bad)).toBeNull()
    }
  })
})

describe("emailDomain / hashEmail", () => {
  it("extracts the host", () => {
    expect(emailDomain("info@shop.ng")).toBe("shop.ng")
  })

  it("hashes stably so an erased prospect stays suppressed", () => {
    expect(hashEmail("info@shop.ng")).toBe(hashEmail("info@shop.ng"))
    expect(hashEmail("info@shop.ng")).not.toBe(hashEmail("info@other.ng"))
    expect(hashEmail("info@shop.ng")).toHaveLength(64)
  })
})

describe("normalizeNgPhone", () => {
  it("accepts every shape a Nigerian number arrives in", () => {
    for (const input of ["08031234567", "8031234567", "+2348031234567", "234 803 123 4567", "0803-123-4567"]) {
      expect(normalizeNgPhone(input)).toBe("+2348031234567")
    }
  })

  it("rejects landlines and malformed numbers", () => {
    for (const bad of ["", "012345678", "0123456789", "080312345", "080312345678", "abc"]) {
      expect(normalizeNgPhone(bad)).toBeNull()
    }
  })
})

describe("normalizeWebsite", () => {
  it("adds a scheme, drops www and the trailing slash", () => {
    expect(normalizeWebsite("WWW.Shop.NG/")).toBe("https://shop.ng")
    expect(normalizeWebsite("http://shop.ng/about")).toBe("http://shop.ng/about")
  })

  it("rejects values that are not hosts", () => {
    expect(normalizeWebsite("")).toBeNull()
    expect(normalizeWebsite("localhost")).toBeNull()
  })
})

describe("normalizeInstagram", () => {
  it("reduces every form to a bare handle", () => {
    for (const input of ["@ovie_fabrics", "ovie_fabrics", "https://instagram.com/ovie_fabrics", "https://www.instagram.com/ovie_fabrics/?hl=en"]) {
      expect(normalizeInstagram(input)).toBe("ovie_fabrics")
    }
  })

  it("rejects handles Instagram would not allow", () => {
    expect(normalizeInstagram("has spaces")).toBeNull()
    expect(normalizeInstagram("a".repeat(31))).toBeNull()
  })
})

describe("demoSlug", () => {
  it("produces a readable slug the prospect will recognise", () => {
    expect(demoSlug("Ovie Fabrics & Co.")).toBe("ovie-fabrics-co")
  })

  it("never emits a leading or trailing dash, even when truncating", () => {
    const slug = demoSlug("A".repeat(47) + " B")
    expect(slug.startsWith("-")).toBe(false)
    expect(slug.endsWith("-")).toBe(false)
    expect(slug.length).toBeLessThanOrEqual(48)
  })

  it("falls back rather than returning an empty slug", () => {
    expect(demoSlug("!!!")).toBe("business")
  })

  it("appends a caller-supplied suffix for collision resolution", () => {
    expect(demoSlug("Ovie Fabrics", "2")).toBe("ovie-fabrics-2")
  })
})

describe("titleCase", () => {
  it("normalises shouty spreadsheet cells", () => {
    expect(titleCase("  ADAOBI okeke ")).toBe("Adaobi Okeke")
  })
})
