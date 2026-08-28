import type { ResolvedSpan } from "./promptEdit"

// Rendering data for the review screen.
//
// We already know every changed span, so there is nothing to diff at document
// scale — a naive LCS over a 390K-char prompt would freeze the browser and
// could mis-align. Instead we cut a small hunk around each known span, and only
// run a word diff INSIDE a hunk, where the input is bounded.

export interface DiffHunk {
  /** One-line label the model gave this edit. */
  note: string
  op: string
  /** Text being removed (empty for a pure insertion). */
  removed: string
  /** Text being inserted (empty for a pure deletion). */
  added: string
  contextBefore: string
  contextAfter: string
  /** 1-based line number of the change, for display. */
  line: number
}

const CONTEXT_LINES = 3
/**
 * Hard character cap per side. Line-based context alone is not enough: a prompt
 * with no newlines (the 390K single-blob case) has exactly one "line", so
 * slicing by lines would ship the whole document to the browser.
 */
const CONTEXT_CHARS = 400

function trailingContext(text: string, lines: number): string {
  const parts = text.split("\n")
  const byLine = parts.slice(Math.max(0, parts.length - lines)).join("\n")
  return byLine.length > CONTEXT_CHARS ? `…${byLine.slice(-CONTEXT_CHARS)}` : byLine
}

function leadingContext(text: string, lines: number): string {
  const byLine = text.split("\n").slice(0, lines).join("\n")
  return byLine.length > CONTEXT_CHARS ? `${byLine.slice(0, CONTEXT_CHARS)}…` : byLine
}

/** Small payload: hunks only, never the whole document. */
export function buildDiffHunks(doc: string, spans: ResolvedSpan[], contextLines = CONTEXT_LINES): DiffHunk[] {
  return spans.map((s) => ({
    note: s.note,
    op: s.op,
    removed: doc.slice(s.start, s.end),
    added: s.text,
    contextBefore: trailingContext(doc.slice(0, s.start), contextLines),
    contextAfter: leadingContext(doc.slice(s.end), contextLines),
    line: doc.slice(0, s.start).split("\n").length,
  }))
}

export type WordDiffPart = { value: string; kind: "same" | "removed" | "added" }

/** Guard: word-level LCS is O(n*m), so refuse inputs a hunk should never reach. */
export const MAX_WORD_DIFF_CHARS = 4_000

/**
 * Word-level diff for use INSIDE one hunk. Returns a flat run-list. Falls back
 * to a whole-block replace when either side is too large to diff cheaply.
 */
export function wordDiff(before: string, after: string): WordDiffPart[] {
  if (before === after) return before ? [{ value: before, kind: "same" }] : []
  if (before.length > MAX_WORD_DIFF_CHARS || after.length > MAX_WORD_DIFF_CHARS) {
    const out: WordDiffPart[] = []
    if (before) out.push({ value: before, kind: "removed" })
    if (after) out.push({ value: after, kind: "added" })
    return out
  }

  // Keep separators as tokens so whitespace is reproduced exactly on re-join.
  const a = before.split(/(\s+)/).filter((t) => t !== "")
  const b = after.split(/(\s+)/).filter((t) => t !== "")

  const m = a.length
  const n = b.length
  const table: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0))
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      table[i][j] = a[i] === b[j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1])
    }
  }

  const parts: WordDiffPart[] = []
  const push = (value: string, kind: WordDiffPart["kind"]) => {
    const last = parts[parts.length - 1]
    if (last && last.kind === kind) last.value += value
    else parts.push({ value, kind })
  }

  let i = 0
  let j = 0
  while (i < m && j < n) {
    if (a[i] === b[j]) {
      push(a[i], "same")
      i++
      j++
    } else if (table[i + 1][j] >= table[i][j + 1]) {
      push(a[i], "removed")
      i++
    } else {
      push(b[j], "added")
      j++
    }
  }
  while (i < m) push(a[i++], "removed")
  while (j < n) push(b[j++], "added")

  return parts
}
