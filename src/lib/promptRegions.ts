// Locating the part of a large prompt an instruction refers to, without sending
// the whole thing to the model.
//
// Production prompts are usually ~1.2K chars, but the tail reaches 390K. Sending
// 390K asking for an edit is both expensive and the main cause of collateral
// drift, so above a budget we send selected regions plus an outline of what we
// left out.
//
// This never affects correctness of the splice: the model returns anchor TEXT,
// which src/lib/promptEdit.ts resolves against the FULL document afterwards. A
// badly chosen window can only cause a clean "not found", never a wrong edit.

/** Send the whole document below this; sectioning is a tail-only path. */
export const CONTEXT_BUDGET = 12_000
/** Always include this much of the head — identity and tone rules live there. */
export const PREAMBLE_CHARS = 800
/** Above this, refuse rather than guess when nothing scores. */
export const REFUSE_ABOVE = 50_000
const WINDOW_SIZE = 4_000
const WINDOW_OVERLAP = 400

export interface Region {
  title: string
  start: number
  end: number
}

export interface ScoredRegion extends Region {
  score: number
}

export interface ContextSelection {
  /** Text to give the model. */
  text: string
  /** False when the whole document fitted — the common case. */
  sectioned: boolean
  totalRegions: number
  selectedRegions: number
  /** Titles of every region, so the model knows what it was not shown. */
  outline: string[]
  /** True when no region matched the instruction; prefer append over rewrite. */
  noMatch: boolean
  /** True when the document is too large to search reliably. */
  tooLarge: boolean
}

function regionsFromLineMatches(doc: string, re: RegExp): Region[] {
  const starts: { index: number; title: string }[] = []
  const rx = new RegExp(re.source, re.flags.includes("g") ? re.flags : `${re.flags}g`)
  for (let m = rx.exec(doc); m !== null; m = rx.exec(doc)) {
    starts.push({ index: m.index, title: m[0].trim() })
    if (m[0].length === 0) rx.lastIndex++
  }
  if (starts.length === 0) return []

  const regions: Region[] = []
  // Text before the first heading is its own region — it is usually the role
  // definition, which tone instructions target.
  if (starts[0].index > 0) regions.push({ title: "", start: 0, end: starts[0].index })
  starts.forEach((s, i) => {
    regions.push({ title: s.title, start: s.index, end: i + 1 < starts.length ? starts[i + 1].index : doc.length })
  })
  return regions
}

function paragraphRegions(doc: string): Region[] {
  const regions: Region[] = []
  const re = /\n\s*\n/g
  let start = 0
  for (let m = re.exec(doc); m !== null; m = re.exec(doc)) {
    regions.push({ title: "", start, end: m.index })
    start = m.index + m[0].length
  }
  if (start < doc.length) regions.push({ title: "", start, end: doc.length })
  return regions
}

function windowRegions(doc: string): Region[] {
  const regions: Region[] = []
  const step = WINDOW_SIZE - WINDOW_OVERLAP
  for (let start = 0; start < doc.length; start += step) {
    const end = Math.min(doc.length, start + WINDOW_SIZE)
    regions.push({ title: "", start, end })
    if (end === doc.length) break
  }
  return regions
}

/**
 * Split into regions with ABSOLUTE offsets, trying progressively weaker
 * structure. Falls back to overlapping fixed windows so a target straddling a
 * boundary is still whole in at least one region.
 */
export function splitSections(doc: string): Region[] {
  if (!doc) return []
  const strategies: RegExp[] = [
    /^[ \t]*#{1,6}[ \t]+.+$/m, // markdown headings
    /^[ \t]*\*\*.+\*\*[ \t]*$/m, // bold-line headings
    /^[A-Z][^\n]{0,60}:[ \t]*$/m, // "Operating hours:" label lines
  ]
  for (const re of strategies) {
    const regions = regionsFromLineMatches(doc, re)
    if (regions.length >= 2) return regions
  }
  const paras = paragraphRegions(doc)
  if (paras.length >= 2) return paras
  return windowRegions(doc)
}

const STOPWORDS = new Set([
  "the", "a", "an", "to", "of", "in", "on", "at", "for", "and", "or", "but", "is", "are", "was",
  "were", "be", "been", "it", "its", "this", "that", "with", "as", "by", "from", "we", "our",
  "you", "your", "they", "them", "should", "would", "can", "will", "when", "if", "so", "not",
  // Imperatives that appear in almost every instruction and carry no location signal.
  "change", "make", "update", "set", "add", "remove", "delete", "edit", "rewrite", "please",
  "more", "less", "always", "never", "instead", "also", "just", "now", "new",
])

/** Domain synonyms — an instruction rarely uses the prompt's own wording. */
const EXPANSIONS: Record<string, string[]> = {
  hours: ["hour", "open", "opening", "clos", "closing", "time", "schedule", "shut", "am", "pm"],
  hour: ["hours", "open", "clos", "time", "schedule"],
  close: ["clos", "closing", "shut", "hours", "open"],
  closing: ["clos", "close", "shut", "hours", "open"],
  open: ["opening", "hours", "clos", "time"],
  price: ["pricing", "cost", "rate", "fee", "charge", "naira", "amount"],
  pricing: ["price", "cost", "rate", "fee", "charge"],
  delivery: ["deliver", "shipping", "ship", "dispatch", "logistics"],
  refund: ["return", "exchange", "policy", "money"],
  tone: ["voice", "style", "polite", "formal", "friendly", "warm", "manner"],
  straightforward: ["direct", "concise", "brief", "blunt", "plain", "tone", "style"],
  friendly: ["warm", "polite", "tone", "style"],
  greeting: ["greet", "hello", "welcome", "intro"],
  product: ["products", "item", "catalogue", "catalog", "stock", "range"],
}

function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 1 && !STOPWORDS.has(t))
}

function expand(tokens: string[]): string[] {
  const out = new Set<string>()
  for (const t of tokens) {
    out.add(t)
    for (const e of EXPANSIONS[t] ?? []) out.add(e)
  }
  return [...out]
}

/**
 * Score regions by term overlap with the instruction. Pure local computation —
 * no embedding call, no second LLM round trip.
 */
export function scoreRegions(doc: string, regions: Region[], instruction: string): ScoredRegion[] {
  const terms = expand(tokenize(instruction))
  if (terms.length === 0 || regions.length === 0) {
    return regions.map((r) => ({ ...r, score: 0 }))
  }

  const bodies = regions.map((r) => doc.slice(r.start, r.end).toLowerCase())
  const titles = regions.map((r) => r.title.toLowerCase())

  // Rare terms discriminate; a term in every region tells us nothing.
  const df = new Map<string, number>()
  for (const term of terms) {
    df.set(term, bodies.filter((b) => b.includes(term)).length)
  }

  return regions.map((r, i) => {
    let score = 0
    for (const term of terms) {
      const hits = bodies[i].split(term).length - 1
      if (hits === 0) continue
      const idf = Math.log(regions.length / (1 + (df.get(term) ?? 0))) + 1
      score += hits * idf
      if (titles[i].includes(term)) score += 3 * idf
    }
    return { ...r, score }
  })
}

/**
 * Assemble what to send the model. Under budget the whole document goes, and
 * none of the machinery above runs.
 */
export function selectContext(
  doc: string,
  instruction: string,
  budget: number = CONTEXT_BUDGET
): ContextSelection {
  if (doc.length <= budget) {
    return {
      text: doc,
      sectioned: false,
      totalRegions: 1,
      selectedRegions: 1,
      outline: [],
      noMatch: false,
      tooLarge: false,
    }
  }

  const regions = splitSections(doc)
  const scored = scoreRegions(doc, regions, instruction)
  const outline = regions.map((r, i) => r.title || `(section ${i + 1})`)
  const matched = scored.filter((r) => r.score > 0).sort((a, b) => b.score - a.score)

  if (matched.length === 0) {
    // Nothing to locate. Above the ceiling that is a refusal, not a guess;
    // below it, the preamble plus the outline is enough for an append.
    return {
      text: doc.slice(0, PREAMBLE_CHARS),
      sectioned: true,
      totalRegions: regions.length,
      selectedRegions: 0,
      outline,
      noMatch: true,
      tooLarge: doc.length > REFUSE_ABOVE,
    }
  }

  const preamble = doc.slice(0, PREAMBLE_CHARS)
  const chosen: ScoredRegion[] = []
  let used = preamble.length
  for (const r of matched) {
    const size = r.end - r.start
    if (used + size > budget) continue
    chosen.push(r)
    used += size
  }
  // Always carry at least the best region, even if it alone exceeds the budget.
  if (chosen.length === 0) chosen.push(matched[0])

  chosen.sort((a, b) => a.start - b.start)
  const body = chosen.map((r) => doc.slice(r.start, r.end)).join("\n\n[…]\n\n")

  return {
    text: `${preamble}\n\n[…]\n\n${body}`,
    sectioned: true,
    totalRegions: regions.length,
    selectedRegions: chosen.length,
    outline,
    noMatch: false,
    tooLarge: false,
  }
}
