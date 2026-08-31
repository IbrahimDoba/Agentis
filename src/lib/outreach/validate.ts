// Deterministic gates on generated copy. Pure, so it is unit-tested rather than
// tested through the route.
//
// These run before a human ever sees a draft. The model is good but it is
// optimistic in specific, repeatable ways — it flatters, it pads, it invents a
// detail that "must" be true — and every one of those tells reads as a mass
// mailout to the person receiving it. Catching them in code keeps the review
// queue about judgement instead of proofreading.

export type GeneratedCopy = {
  subject: string
  body: string
  sourceDisclosure: string
  observedSignals: { claim: string; sourceUrl: string }[]
}

export type ValidationContext = {
  // Hosts we actually fetched. A claim citing anything else is a fabrication
  // dressed up as research, which is worse than no personalization.
  fetchedHosts: string[]
  // Spliced verbatim into the disclosure sentence, e.g. "your Instagram bio".
  sourceLabel: string
  demoUrl: string
}

export type ValidationResult =
  | { ok: true }
  | { ok: false; failures: string[] }

export const MAX_BODY_WORDS = 130
export const MAX_SUBJECT_CHARS = 55
export const MIN_OBSERVED_SIGNALS = 1

// Openers that announce "this is a template". Matched case-insensitively as
// whole phrases; a legitimate sentence never contains one of these.
const BANNED_PHRASES = [
  "i hope this finds you well",
  "i hope this email finds you",
  "i came across",
  "i stumbled upon",
  "i was impressed",
  "i loved your",
  "i love your",
  "reaching out because",
  "quick question for you",
  "in today's fast-paced",
  "as a fellow",
  "game[- ]chang(er|ing)",
  "revolutioni[sz]e",
  "leverage your",
  "circle back",
  "touch base",
  "synerg(y|ies)",
  "unlock the power",
  "take your business to the next level",
  "i'd love to (hop on|jump on|schedule)",
  "15 minutes of your time",
  "let me know if you'd be open",
]

export function countWords(text: string): number {
  const trimmed = text.trim()
  return trimmed ? trimmed.split(/\s+/).length : 0
}

export function extractUrls(text: string): string[] {
  return text.match(/https?:\/\/[^\s<>()"']+/gi) ?? []
}

function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase()
  } catch {
    return null
  }
}

export function findBannedPhrases(text: string): string[] {
  const haystack = text.toLowerCase()
  return BANNED_PHRASES.filter((p) => new RegExp(p, "i").test(haystack))
}

export function validateCopy(copy: GeneratedCopy, ctx: ValidationContext): ValidationResult {
  const failures: string[] = []

  const words = countWords(copy.body)
  if (words > MAX_BODY_WORDS) failures.push(`body is ${words} words, max ${MAX_BODY_WORDS}`)
  if (words < 20) failures.push(`body is only ${words} words`)

  if (!copy.subject.trim()) failures.push("subject is empty")
  if (copy.subject.length > MAX_SUBJECT_CHARS) {
    failures.push(`subject is ${copy.subject.length} chars, max ${MAX_SUBJECT_CHARS}`)
  }
  // A cold email faking a reply is a dark pattern and a spam-filter signal.
  if (/^\s*(re|fwd?)\s*:/i.test(copy.subject)) failures.push("subject fakes a reply or forward")
  if (/[A-Z]{4,}/.test(copy.subject)) failures.push("subject contains shouty capitals")

  const urls = extractUrls(copy.body)
  if (urls.length === 0) failures.push("body has no demo link")
  if (urls.length > 1) failures.push(`body has ${urls.length} links, expected exactly 1`)
  if (urls.length === 1 && urls[0] !== ctx.demoUrl) {
    failures.push("body links somewhere other than the demo")
  }

  const banned = findBannedPhrases(`${copy.subject}\n${copy.body}`)
  if (banned.length > 0) failures.push(`banned phrasing: ${banned.join(", ")}`)

  // Em and en dashes are the loudest LLM tell in short-form copy.
  if (/[—–]/.test(copy.body)) failures.push("body contains an em or en dash")

  if (copy.observedSignals.length < MIN_OBSERVED_SIGNALS) {
    failures.push("no observed signal — nothing to open on")
  }
  const allowed = new Set(ctx.fetchedHosts.map((h) => h.replace(/^www\./, "").toLowerCase()))
  for (const signal of copy.observedSignals) {
    const host = hostOf(signal.sourceUrl)
    if (!host) failures.push(`signal has an unparseable source: ${signal.sourceUrl}`)
    else if (!allowed.has(host)) failures.push(`signal cites ${host}, which we never fetched`)
  }

  // The disclosure has to name the same place we told the importer we found
  // them, or the NDPA answer and the email disagree.
  if (!copy.sourceDisclosure.toLowerCase().includes(ctx.sourceLabel.toLowerCase())) {
    failures.push(`disclosure omits the source label "${ctx.sourceLabel}"`)
  }

  return failures.length === 0 ? { ok: true } : { ok: false, failures }
}
