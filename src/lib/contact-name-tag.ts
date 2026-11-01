// Optional tag the owner picks, appended to every contact saved for them
// ("Ada Obi - Shop"). Shared by the Contacts tab and the settings route, so no
// server-only imports here. No preset: it's the owner's word, not the platform's.

export const NAME_TAG_MAX = 12

// Letters, digits and a few separators. Keeps emoji-soup and anything that
// would read as part of the customer's own name out of the owner's phone book.
const ALLOWED = /^[\p{L}\p{N} ·.\-_|()]+$/u

export function normalizeNameTag(raw: string | null | undefined): { ok: true; tag: string | null } | { ok: false; error: string } {
  const tag = (raw ?? "").trim().replace(/\s+/g, " ")
  if (!tag) return { ok: true, tag: null }
  if (tag.length > NAME_TAG_MAX) return { ok: false, error: `Keep the tag to ${NAME_TAG_MAX} characters or fewer` }
  if (!ALLOWED.test(tag)) return { ok: false, error: "Use letters, numbers, spaces and - · . _ | ( ) only" }
  return { ok: true, tag }
}

export function previewSavedName(name: string, tag: string | null): string {
  return tag ? `${name} ${tag}` : name
}
