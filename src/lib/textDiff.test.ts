import { describe, it, expect } from "vitest"
import { buildDiffHunks, wordDiff, MAX_WORD_DIFF_CHARS } from "./textDiff"
import type { ResolvedSpan } from "./promptEdit"

const DOC = ["line one", "line two", "line three", "TARGET", "line five", "line six", "line seven"].join("\n")

function span(start: number, end: number, text: string): ResolvedSpan {
  return { start, end, text, note: "n", op: "replace" }
}

describe("buildDiffHunks", () => {
  it("returns the removed and added text with surrounding context", () => {
    const start = DOC.indexOf("TARGET")
    const [hunk] = buildDiffHunks(DOC, [span(start, start + 6, "REPLACED")])
    expect(hunk.removed).toBe("TARGET")
    expect(hunk.added).toBe("REPLACED")
    expect(hunk.contextBefore).toContain("line three")
    expect(hunk.contextAfter).toContain("line five")
  })

  it("reports a 1-based line number", () => {
    const start = DOC.indexOf("TARGET")
    const [hunk] = buildDiffHunks(DOC, [span(start, start + 6, "X")])
    expect(hunk.line).toBe(4)
  })

  it("never includes the whole document", () => {
    const big = "x".repeat(300_000) + "\nTARGET\n" + "y".repeat(300_000)
    const start = big.indexOf("TARGET")
    const [hunk] = buildDiffHunks(big, [span(start, start + 6, "Z")])
    const total = hunk.contextBefore.length + hunk.contextAfter.length + hunk.removed.length
    expect(total).toBeLessThan(big.length / 100)
  })
})

describe("wordDiff", () => {
  it("marks nothing when the strings match", () => {
    expect(wordDiff("same text", "same text")).toEqual([{ value: "same text", kind: "same" }])
  })

  it("isolates a single changed word and keeps the rest shared", () => {
    const parts = wordDiff("open at 6pm daily", "open at 7pm daily")
    expect(parts.filter((p) => p.kind === "removed").map((p) => p.value).join("")).toContain("6pm")
    expect(parts.filter((p) => p.kind === "added").map((p) => p.value).join("")).toContain("7pm")
    expect(parts.some((p) => p.kind === "same" && p.value.includes("open"))).toBe(true)
  })

  it("reconstructs both sides exactly", () => {
    const before = "the quick brown fox"
    const after = "the slow brown dog"
    const parts = wordDiff(before, after)
    const rebuiltBefore = parts.filter((p) => p.kind !== "added").map((p) => p.value).join("")
    const rebuiltAfter = parts.filter((p) => p.kind !== "removed").map((p) => p.value).join("")
    expect(rebuiltBefore).toBe(before)
    expect(rebuiltAfter).toBe(after)
  })

  it("handles pure insertion and pure deletion", () => {
    expect(wordDiff("", "added text").every((p) => p.kind === "added")).toBe(true)
    expect(wordDiff("gone text", "").every((p) => p.kind === "removed")).toBe(true)
  })

  it("falls back to a block replace above the size guard", () => {
    const big = "w ".repeat(MAX_WORD_DIFF_CHARS)
    const parts = wordDiff(big, "small")
    expect(parts).toHaveLength(2)
    expect(parts[0].kind).toBe("removed")
    expect(parts[1].kind).toBe("added")
  })
})
