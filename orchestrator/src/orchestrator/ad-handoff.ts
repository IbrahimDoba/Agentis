// Pure ad-handoff matching — no config/db imports, so it's unit-testable
// (config.ts exits at import time without a full env).

export const DEFAULT_AD_HANDOFF_MESSAGE = "Thank you for reaching out! A team member will attend to you shortly 🙏"

interface AdText {
  title?: string | null
  body?: string | null
}

// Returns the keyword that matched (for logging/handoff reason) or null.
// Case-insensitive substring match over the ad's headline + body, so
// "#JUSTFITSCARS", "#JustFitsCars" and "justfitscars" all match the keyword
// "#justfitscars". Blank keywords are ignored so an empty entry can't match
// every ad.
export function matchAdHandoffKeyword(ad: AdText | null | undefined, keywords: string[]): string | null {
  if (!ad || keywords.length === 0) return null
  const haystack = `${ad.title ?? ""}\n${ad.body ?? ""}`.toLowerCase()
  if (!haystack.trim()) return null
  for (const raw of keywords) {
    const kw = raw.trim().toLowerCase()
    if (kw && haystack.includes(kw)) return raw.trim()
  }
  return null
}
