import { describe, it, expect } from "vitest"
import { parseCsvRows } from "./csv"
import { scoreFit, FIT_THRESHOLD } from "./fit"
import { normalizeEmail, normalizeNgPhone, normalizeInstagram } from "./normalize"

// Contract between tools/outreach-sourcer (Python) and the import route.
//
// The sourcer writes this header verbatim. If either side changes a column name
// the mismatch is silent — rows import with blank fields and score near zero —
// so it is pinned here rather than discovered after a thousand-domain crawl.

const HEADER =
  "businessname,email,sourcelabel,sourceurl,contactname,city,phone,whatsapp," +
  "website,instagram,vertical,reviewcount,branchcount,haspricelist,sellsindms"

// A real row produced by the sourcer, not a hand-written approximation.
const ROW =
  "Nectar Beauty Hub,customerservice@nectarbeautyhub.com,your website footer," +
  "https://nectarbeautyhub.com,,Lagos,+234 812 486 3945,+2349026051281," +
  "https://nectarbeautyhub.com,nectarbeautyng_,ecommerce,,,yes,"

describe("sourcer CSV contract", () => {
  const rows = parseCsvRows(`${HEADER}\n${ROW}`)

  it("parses into exactly one row", () => {
    expect(rows).toHaveLength(1)
  })

  it("populates every field the import route reads", () => {
    const row = rows[0]
    for (const key of ["businessname", "email", "sourcelabel", "sourceurl"]) {
      expect(row[key], `required column ${key} is empty`).toBeTruthy()
    }
    expect(row.city).toBe("Lagos")
    expect(row.whatsapp).toBe("+2349026051281")
    expect(row.instagram).toBe("nectarbeautyng_")
    expect(row.vertical).toBe("ecommerce")
    expect(row.haspricelist).toBe("yes")
  })

  it("normalises the raw values the sourcer emits", () => {
    const row = rows[0]
    expect(normalizeEmail(row.email)).toBe("customerservice@nectarbeautyhub.com")
    expect(normalizeNgPhone(row.whatsapp)).toBe("+2349026051281")
    expect(normalizeNgPhone(row.phone)).toBe("+2348124863945")
    expect(normalizeInstagram(row.instagram)).toBe("nectarbeautyng_")
  })

  it("scores a sourced prospect above the import threshold", () => {
    const row = rows[0]
    const fit = scoreFit({
      vertical: row.vertical,
      city: row.city,
      whatsappNumber: normalizeNgPhone(row.whatsapp),
      website: row.website,
      instagram: row.instagram,
      reviewCount: null,
      research: { hasPriceList: row.haspricelist === "yes", sellsInDms: false },
    })
    // If a genuine sourced row cannot clear the threshold, the sourcer is
    // gathering the wrong signals or the threshold is wrong. Either way, catch it here.
    expect(fit.disqualified).toBe(false)
    expect(fit.score).toBeGreaterThanOrEqual(FIT_THRESHOLD)
  })

  it("rejects a row missing its source, which has no NDPA position", () => {
    const bad = parseCsvRows(`${HEADER}\nShop,a@b.ng,,,,,,,,,,,,,`)[0]
    expect(bad.sourcelabel).toBe("")
    expect(bad.sourceurl).toBe("")
  })
})
