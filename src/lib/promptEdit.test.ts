import { describe, it, expect } from "vitest"
import {
  verifyAndApplyEdits,
  assertOutsideUnchanged,
  findAnchorOccurrences,
  hashValue,
  type EditOp,
} from "./promptEdit"

const DOC = [
  "You are the assistant for Ovie Fabrics.",
  "",
  "## Operating hours",
  "We are open Mon-Fri 9am-6pm and Sat 9am-4pm.",
  "",
  "## Tone",
  "Be warm and unhurried with customers.",
].join("\n")

function replace(anchor: string, text: string, note = "test"): EditOp {
  return { op: "replace", target: "responseGuidelines", anchor, text, note }
}
function append(text: string, note = "test"): EditOp {
  return { op: "append", target: "responseGuidelines", anchor: null, text, note }
}
function insertAfter(anchor: string, text: string, note = "test"): EditOp {
  return { op: "insert_after", target: "responseGuidelines", anchor, text, note }
}

function expectOk(r: ReturnType<typeof verifyAndApplyEdits>) {
  if (!r.ok) throw new Error(`expected ok, got ${r.code}: ${r.message}`)
  return r
}

describe("verifyAndApplyEdits — the core guarantee", () => {
  it("replaces a unique anchor and leaves every other byte identical", () => {
    const r = expectOk(verifyAndApplyEdits(DOC, [replace("Sat 9am-4pm", "Sat 9am-7pm")]))
    const { start, end } = r.spans[0]

    expect(r.value).toContain("Sat 9am-7pm")
    // Both sides of the edited span must be untouched.
    expect(r.value.slice(0, start)).toBe(DOC.slice(0, start))
    expect(r.value.slice(start + r.spans[0].text.length)).toBe(DOC.slice(end))
  })

  it("rejects an anchor that is not present", () => {
    const r = verifyAndApplyEdits(DOC, [replace("Sun 10am-2pm", "Sun closed")])
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.code).toBe("ANCHOR_NOT_FOUND")
  })

  it("rejects an ambiguous anchor and reports every occurrence", () => {
    const doc = "Call us.\nCall us.\n"
    const r = verifyAndApplyEdits(doc, [replace("Call us.", "Message us.")])
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.code).toBe("ANCHOR_AMBIGUOUS")
      expect(r.occurrences).toHaveLength(2)
      expect(r.occurrences![0]).toHaveProperty("context")
    }
  })

  it("rejects an empty or whitespace-only anchor", () => {
    expect(verifyAndApplyEdits(DOC, [replace("", "x")]).ok).toBe(false)
    const r = verifyAndApplyEdits(DOC, [replace("   ", "x")])
    if (!r.ok) expect(r.code).toBe("ANCHOR_EMPTY")
  })

  // Uniqueness alone would happily corrupt "17pm" here.
  it("refuses a short anchor that only matches mid-word", () => {
    const doc = "We open at 17pm daily."
    const r = verifyAndApplyEdits(doc, [replace("7pm", "8pm")])
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.code).toBe("ANCHOR_UNSAFE")
  })

  it("allows a short anchor that does sit on word boundaries", () => {
    const doc = "We open at 7pm daily."
    const r = expectOk(verifyAndApplyEdits(doc, [replace("7pm", "8pm")]))
    expect(r.value).toBe("We open at 8pm daily.")
  })

  it("absorbs whitespace drift and splices the document's own bytes", () => {
    const doc = "Hours:  Mon-Fri  9am - 6pm.\nEnd."
    // Model normalised the double spaces when copying the anchor.
    const r = expectOk(verifyAndApplyEdits(doc, [replace("Mon-Fri 9am - 6pm", "Mon-Sat 9am - 8pm")]))
    expect(r.value).toBe("Hours:  Mon-Sat 9am - 8pm.\nEnd.")
    // The removed span is the document's version, including the double space.
    expect(doc.slice(r.spans[0].start, r.spans[0].end)).toBe("Mon-Fri  9am - 6pm")
  })

  it("preserves CRLF on untouched lines", () => {
    const doc = "One\r\nTwo\r\nThree\r\n"
    const r = expectOk(verifyAndApplyEdits(doc, [replace("Two", "Deux")]))
    expect(r.value).toBe("One\r\nDeux\r\nThree\r\n")
  })

  it("keeps offsets correct after multi-byte characters", () => {
    const doc = "Café ☕ — open at 9am. Closing at 6pm."
    const r = expectOk(verifyAndApplyEdits(doc, [replace("Closing at 6pm", "Closing at 7pm")]))
    expect(r.value).toBe("Café ☕ — open at 9am. Closing at 7pm.")
  })

  it("applies several edits at once, order-independently", () => {
    const ops = [
      replace("Sat 9am-4pm", "Sat 9am-7pm"),
      replace("Be warm and unhurried", "Be direct and brief"),
      replace("Ovie Fabrics", "Ovie Textiles"),
    ]
    const forward = expectOk(verifyAndApplyEdits(DOC, ops))
    const reversed = expectOk(verifyAndApplyEdits(DOC, [...ops].reverse()))
    expect(forward.value).toBe(reversed.value)
    expect(forward.value).toContain("Sat 9am-7pm")
    expect(forward.value).toContain("Be direct and brief")
    expect(forward.value).toContain("Ovie Textiles")
    // Untouched sections survive.
    expect(forward.value).toContain("## Operating hours")
  })

  it("rejects overlapping edits outright", () => {
    // Long enough that neither anchor trips the breadth guard first.
    const doc = "alpha bravo charlie delta echo foxtrot golf hotel india juliet kilo lima"
    const r = verifyAndApplyEdits(doc, [replace("alpha bravo", "x"), replace("bravo charlie", "y")])
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.code).toBe("SPANS_OVERLAP")
  })

  it("insert_after keeps the anchor and puts text straight after it", () => {
    const r = expectOk(verifyAndApplyEdits(DOC, [insertAfter("## Tone", "\nAlways greet by name.")]))
    expect(r.value).toContain("## Tone\nAlways greet by name.")
    expect(r.value).toContain("Be warm and unhurried")
  })

  it("rejects a whole-document rewrite disguised as a replace", () => {
    const r = verifyAndApplyEdits(DOC, [replace(DOC, "Totally new prompt.")])
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.code).toBe("ANCHOR_TOO_BROAD")
  })

  it("trips the shrink guard on a large delete", () => {
    // 400-char anchor in a 1000-char doc: 40% (under the breadth guard) but the
    // deletion still exceeds the 25% shrink allowance.
    const doc = "keep\n" + "x".repeat(400) + "\n" + "y".repeat(594)
    const r = verifyAndApplyEdits(doc, [replace("x".repeat(400), "")])
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.code).toBe("SHRINK_GUARD")
  })

  it("allows a small delete", () => {
    const r = expectOk(verifyAndApplyEdits(DOC, [replace(" and Sat 9am-4pm", "")]))
    expect(r.value).toContain("We are open Mon-Fri 9am-6pm.")
  })

  it("rejects more than the op cap", () => {
    const ops = Array.from({ length: 11 }, () => replace("Ovie Fabrics", "X"))
    const r = verifyAndApplyEdits(DOC, ops)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.code).toBe("TOO_MANY_OPS")
  })

  it("rejects an empty proposal", () => {
    const r = verifyAndApplyEdits(DOC, [])
    if (!r.ok) expect(r.code).toBe("NO_OPS")
  })

  it("rejects a target outside the allow-list", () => {
    const bad = { ...replace("Ovie Fabrics", "X"), target: "openaiApiKey" } as unknown as EditOp
    const r = verifyAndApplyEdits(DOC, [bad])
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.code).toBe("FIELD_NOT_ALLOWED")
  })

  // Re-running an applied proposal must not stack a second copy.
  it("is idempotent — a second apply finds nothing", () => {
    const ops = [replace("Sat 9am-4pm", "Sat 9am-7pm")]
    const first = expectOk(verifyAndApplyEdits(DOC, ops))
    const second = verifyAndApplyEdits(first.value, ops)
    expect(second.ok).toBe(false)
    if (!second.ok) expect(second.code).toBe("ANCHOR_NOT_FOUND")
  })
})

describe("append", () => {
  it("separates from existing content with exactly one blank line", () => {
    const r = expectOk(verifyAndApplyEdits("Existing.", [append("Always mention free delivery.")]))
    expect(r.value).toBe("Existing.\n\nAlways mention free delivery.")
  })

  it("does not stack newlines when the document already ends with them", () => {
    for (const tail of ["\n", "\n\n", "\n\n\n", "  \n"]) {
      const r = expectOk(verifyAndApplyEdits(`Existing.${tail}`, [append("New rule.")]))
      expect(r.value).toBe("Existing.\n\nNew rule.")
    }
  })

  it("writes bare text into an empty document", () => {
    const r = expectOk(verifyAndApplyEdits("", [append("First rule.")]))
    expect(r.value).toBe("First rule.")
  })

  it("leaves everything before the append untouched", () => {
    const r = expectOk(verifyAndApplyEdits(DOC, [append("Always confirm the address.")]))
    expect(r.value.startsWith(DOC.replace(/\s+$/, ""))).toBe(true)
    expect(r.value).toContain("## Operating hours")
  })
})

describe("assertOutsideUnchanged", () => {
  it("throws when a region outside the edit was altered", () => {
    const before = "alpha bravo charlie"
    const spans = [{ start: 6, end: 11, text: "BRAVO", note: "", op: "replace" as const }]
    const corrupted = "ALPHA BRAVO charlie"
    expect(() => assertOutsideUnchanged(before, corrupted, spans)).toThrow()
  })

  it("passes for a correctly spliced result", () => {
    const before = "alpha bravo charlie"
    const spans = [{ start: 6, end: 11, text: "BRAVO", note: "", op: "replace" as const }]
    expect(() => assertOutsideUnchanged(before, "alpha BRAVO charlie", spans)).not.toThrow()
  })
})

describe("helpers", () => {
  it("finds overlapping repeats", () => {
    expect(findAnchorOccurrences("aaa", "aa")).toHaveLength(2)
  })

  it("hashes deterministically and distinguishes different values", () => {
    expect(hashValue("abc")).toBe(hashValue("abc"))
    expect(hashValue("abc")).not.toBe(hashValue("abd"))
  })
})
