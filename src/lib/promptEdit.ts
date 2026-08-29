import { createHash } from "crypto"

// Verify-and-splice core for AI-assisted prompt editing.
//
// The model never rewrites the prompt. It returns anchor+replacement pairs and
// THIS module applies them, so "nothing else changed" is a property we can
// prove rather than trust. Everything here is pure — no db, no network — so the
// guarantee is unit-testable in isolation.
//
// Import types from here in client components with `import type`; the runtime
// entry points pull in node crypto and are server-only.

/** Agent columns an AI edit may touch. One element by design — see the plan. */
export const PROMPT_EDIT_FIELDS = ["responseGuidelines"] as const
export type PromptEditField = (typeof PROMPT_EDIT_FIELDS)[number]

export const MAX_OPS = 10
export const MAX_OP_TEXT = 20_000
/** Below this length an anchor must sit on word boundaries ("7pm" vs "17pm"). */
export const SHORT_ANCHOR_CHARS = 20
/** An anchor covering more than this much of the document is a disguised rewrite. */
export const MAX_ANCHOR_RATIO = 0.6
export const MIN_SHRINK_ALLOWANCE = 200
export const MAX_SHRINK_RATIO = 0.25

export type EditOpKind = "replace" | "insert_after" | "append"

export interface EditOp {
  op: EditOpKind
  target: PromptEditField
  /** Verbatim span copied from the document. Null only for `append`. */
  anchor: string | null
  /** Replacement or inserted text. Empty string on `replace` means delete. */
  text: string
  /** One-line human label for the review UI. */
  note: string
}

export interface ResolvedSpan {
  start: number
  end: number
  /** What replaces [start, end). */
  text: string
  note: string
  op: EditOpKind
}

export interface Occurrence {
  start: number
  end: number
  /** The match plus surrounding text, so the UI can show where it matched. */
  context: string
}

export type VerifyErrorCode =
  | "FIELD_NOT_ALLOWED"
  | "TOO_MANY_OPS"
  | "NO_OPS"
  | "TEXT_TOO_LONG"
  | "ANCHOR_EMPTY"
  | "ANCHOR_NOT_FOUND"
  | "ANCHOR_AMBIGUOUS"
  | "ANCHOR_UNSAFE"
  | "ANCHOR_TOO_BROAD"
  | "SPANS_OVERLAP"
  | "SHRINK_GUARD"

export type VerifyResult =
  | { ok: true; value: string; spans: ResolvedSpan[] }
  | {
      ok: false
      code: VerifyErrorCode
      message: string
      /** Populated for ANCHOR_AMBIGUOUS so the UI can show each match. */
      occurrences?: Occurrence[]
    }

export function hashValue(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex")
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

const CONTEXT_CHARS = 60

function contextAround(doc: string, start: number, end: number): string {
  const from = Math.max(0, start - CONTEXT_CHARS)
  const to = Math.min(doc.length, end + CONTEXT_CHARS)
  return (from > 0 ? "…" : "") + doc.slice(from, to) + (to < doc.length ? "…" : "")
}

/** Every exact occurrence of `anchor` in `doc`. */
export function findAnchorOccurrences(doc: string, anchor: string): Occurrence[] {
  const found: Occurrence[] = []
  if (!anchor) return found
  let from = 0
  for (;;) {
    const i = doc.indexOf(anchor, from)
    if (i === -1) break
    found.push({ start: i, end: i + anchor.length, context: contextAround(doc, i, i + anchor.length) })
    // Advance by one so overlapping repeats ("aa" in "aaa") are all reported.
    from = i + 1
  }
  return found
}

/**
 * Whitespace-tolerant match, used ONLY after an exact match failed. Newline and
 * space drift is the dominant way a model deviates when copying a span; content
 * drift is not, so every non-whitespace character still has to match exactly.
 */
function findTolerantOccurrences(doc: string, anchor: string): Occurrence[] {
  const parts = anchor.split(/\s+/).filter(Boolean)
  if (parts.length === 0) return []
  const re = new RegExp(parts.map(escapeRegExp).join("\\s+"), "g")
  const found: Occurrence[] = []
  for (let m = re.exec(doc); m !== null; m = re.exec(doc)) {
    const start = m.index
    const end = start + m[0].length
    found.push({ start, end, context: contextAround(doc, start, end) })
    if (m[0].length === 0) re.lastIndex++
  }
  return found
}

const WORD = /\w/

/**
 * A short anchor must not land mid-word: "7pm" is unique inside "We open at
 * 17pm" but matching it there would corrupt the number. Uniqueness alone does
 * not catch this.
 */
function sitsOnWordBoundaries(doc: string, start: number, end: number): boolean {
  const before = start > 0 ? doc[start - 1] : ""
  const after = end < doc.length ? doc[end] : ""
  const firstIsWord = WORD.test(doc[start] ?? "")
  const lastIsWord = WORD.test(doc[end - 1] ?? "")
  if (firstIsWord && before && WORD.test(before)) return false
  if (lastIsWord && after && WORD.test(after)) return false
  return true
}

interface AnchorResolution {
  span?: { start: number; end: number }
  error?: { code: VerifyErrorCode; message: string; occurrences?: Occurrence[] }
}

function resolveAnchor(doc: string, anchor: string): AnchorResolution {
  if (!anchor || !anchor.trim()) {
    return { error: { code: "ANCHOR_EMPTY", message: "The edit had an empty anchor." } }
  }

  let hits = findAnchorOccurrences(doc, anchor)
  if (hits.length === 0) hits = findTolerantOccurrences(doc, anchor)

  if (hits.length === 0) {
    return {
      error: {
        code: "ANCHOR_NOT_FOUND",
        message: "Could not find that text in your prompt.",
      },
    }
  }
  if (hits.length > 1) {
    return {
      error: {
        code: "ANCHOR_AMBIGUOUS",
        message: `That text appears in ${hits.length} places. Be more specific about which one to change.`,
        occurrences: hits,
      },
    }
  }

  const { start, end } = hits[0]

  if (end - start > doc.length * MAX_ANCHOR_RATIO) {
    return {
      error: {
        code: "ANCHOR_TOO_BROAD",
        message: "That edit would rewrite most of the prompt. Ask for a narrower change.",
      },
    }
  }
  if (end - start < SHORT_ANCHOR_CHARS && !sitsOnWordBoundaries(doc, start, end)) {
    return {
      error: {
        code: "ANCHOR_UNSAFE",
        message: "That text only matches inside a longer word. Ask for a more specific change.",
      },
    }
  }

  return { span: { start, end } }
}

/** Where an `append` lands: after the document's content, trailing blank space replaced. */
function appendSpan(doc: string, text: string): ResolvedSpan {
  const trimmedLength = doc.replace(/\s+$/, "").length
  return {
    start: trimmedLength,
    end: doc.length,
    text: trimmedLength === 0 ? text : `\n\n${text}`,
    note: "",
    op: "append",
  }
}

/**
 * Resolve every op against `doc`, then splice. All-or-nothing: one bad op
 * rejects the whole proposal, because a half-applied edit is the worst state to
 * leave a prompt in.
 */
export function verifyAndApplyEdits(doc: string, ops: EditOp[]): VerifyResult {
  if (ops.length === 0) return { ok: false, code: "NO_OPS", message: "No edits were proposed." }
  if (ops.length > MAX_OPS) {
    return { ok: false, code: "TOO_MANY_OPS", message: `Too many edits at once (max ${MAX_OPS}).` }
  }

  const spans: ResolvedSpan[] = []

  for (const op of ops) {
    if (!PROMPT_EDIT_FIELDS.includes(op.target)) {
      return { ok: false, code: "FIELD_NOT_ALLOWED", message: `Cannot edit "${op.target}".` }
    }
    if (op.text.length > MAX_OP_TEXT) {
      return { ok: false, code: "TEXT_TOO_LONG", message: "The replacement text is too long." }
    }

    if (op.op === "append") {
      const span = appendSpan(doc, op.text)
      spans.push({ ...span, note: op.note })
      continue
    }

    const resolved = resolveAnchor(doc, op.anchor ?? "")
    if (resolved.error) return { ok: false, ...resolved.error }
    const { start, end } = resolved.span!

    spans.push(
      op.op === "insert_after"
        ? { start: end, end, text: op.text, note: op.note, op: op.op }
        : { start, end, text: op.text, note: op.note, op: op.op }
    )
  }

  const ordered = [...spans].sort((a, b) => a.start - b.start)
  for (let i = 1; i < ordered.length; i++) {
    if (ordered[i].start < ordered[i - 1].end) {
      return { ok: false, code: "SPANS_OVERLAP", message: "Those edits overlap each other." }
    }
  }

  const removed = ordered.reduce((n, s) => n + (s.end - s.start) - s.text.length, 0)
  const allowance = Math.max(MIN_SHRINK_ALLOWANCE, Math.floor(doc.length * MAX_SHRINK_RATIO))
  if (removed > allowance) {
    return {
      ok: false,
      code: "SHRINK_GUARD",
      message: "That edit would delete too much of the prompt at once.",
    }
  }

  // Concatenate the untouched slices — the edited regions are the only bytes
  // that can differ, by construction.
  let out = ""
  let cursor = 0
  for (const s of ordered) {
    out += doc.slice(cursor, s.start) + s.text
    cursor = s.end
  }
  out += doc.slice(cursor)

  assertOutsideUnchanged(doc, out, ordered)

  return { ok: true, value: out, spans: ordered }
}

/**
 * Independently re-derive that every region outside the edited spans survived
 * byte-for-byte. True by construction above, which is the point: asserting it
 * turns the promise into something a test can falsify, and catches offset bugs
 * before they reach a customer's prompt.
 *
 * `spans` must be sorted by `start` and non-overlapping.
 */
export function assertOutsideUnchanged(before: string, after: string, spans: ResolvedSpan[]): void {
  let bCursor = 0
  let aCursor = 0
  for (const s of spans) {
    const gap = before.slice(bCursor, s.start)
    if (after.slice(aCursor, aCursor + gap.length) !== gap) {
      throw new Error(`prompt edit corrupted text before offset ${s.start}`)
    }
    bCursor = s.end
    aCursor += gap.length + s.text.length
  }
  if (before.slice(bCursor) !== after.slice(aCursor)) {
    throw new Error("prompt edit corrupted text after the final edit")
  }
}
