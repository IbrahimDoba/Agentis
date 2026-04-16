export function cn(...classes: (string | undefined | false | null)[]) {
  return classes.filter(Boolean).join(" ")
}

export function formatDate(date: string | Date) {
  return new Date(date).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  })
}

export function formatTime(unixSecs: number | null | undefined): string {
  if (!unixSecs) return "—"
  const d = new Date(unixSecs * 1000)
  if (isNaN(d.getTime())) return "—"
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

export function formatDuration(secs: number | null | undefined): string {
  if (!secs) return "0s"
  const m = Math.floor(secs / 60)
  const s = secs % 60
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}

export function formatPhoneNumber(raw: string): string {
  // Handle WhatsApp JID format: 2348012345678:123@s.whatsapp.net
  const jidMatch = raw.match(/^(\d+)[:@]/)
  const cleaned = jidMatch ? jidMatch[1] : raw

  // Strip any non-digit chars
  const digits = cleaned.replace(/\D/g, "")

  // Country code lookup: prefix, local prefix (replaces country code), digit grouping
  const patterns: Array<{ prefix: string; local: string; groups: number[] }> = [
    { prefix: "234", local: "0", groups: [4, 3, 4] },  // Nigeria  0801 234 5678
    { prefix: "1",   local: "",  groups: [3, 3, 4] },   // US/Canada (XXX) XXX-XXXX
    { prefix: "44",  local: "0", groups: [4, 3, 4] },   // UK       0XXXX XXX XXXX
    { prefix: "27",  local: "0", groups: [2, 3, 4] },   // South Africa
    { prefix: "254", local: "0", groups: [3, 3, 3] },   // Kenya
    { prefix: "233", local: "0", groups: [2, 3, 4] },   // Ghana
    { prefix: "255", local: "0", groups: [3, 3, 3] },   // Tanzania
  ]

  for (const { prefix, local, groups } of patterns) {
    if (digits.startsWith(prefix)) {
      const subscriber = digits.slice(prefix.length)
      const full = local + subscriber
      const parts: string[] = []
      let pos = 0
      for (const len of groups) {
        if (pos >= full.length) break
        parts.push(full.slice(pos, pos + len))
        pos += len
      }
      if (pos < full.length) parts.push(full.slice(pos))
      return parts.join(" ")
    }
  }

  // Generic fallback: group in 3s
  return digits.replace(/(\d{3})(?=\d)/g, "$1 ").trim()
}

/**
 * Convert any phone number string to E.164 digits (no +) suitable for wa.me links.
 * Handles:
 *  - WhatsApp JIDs:   2348012345678:12@s.whatsapp.net → 2348012345678
 *  - International:   +234 801 234 5678 → 2348012345678
 *  - Nigerian local:  08012345678 → 2348012345678
 *  - Already correct: 2348012345678 → 2348012345678
 */
export function toE164(raw: string): string | null {
  // Strip JID suffix (e.g. "27791952410:123@s.whatsapp.net" → "27791952410")
  const jidMatch = raw.match(/^(\d+)[:@]/)
  // Strip everything except digits and leading +
  const cleaned = jidMatch ? jidMatch[1] : raw.replace(/[^\d+]/g, "")
  // Remove leading + — wa.me links just need bare digits
  const digits = cleaned.replace(/\D/g, "")

  if (!digits || digits.length < 7) return null

  // WhatsApp Business always sends full international numbers (no leading 0).
  // Trust the number as-is — no country-specific transformation needed.
  return digits
}

export function getCallerIdentifier(conv: {
  user_id?: string | null
  metadata?: Record<string, unknown>
  conversation_id: string
}): string {
  // 1. Top-level user_id (most reliable for WhatsApp)
  if (conv.user_id) {
    const digits = conv.user_id.replace(/\D/g, "")
    if (digits.length >= 7) return formatPhoneNumber(conv.user_id)
  }

  const meta = conv.metadata as Record<string, unknown> | undefined
  if (meta) {
    // 2. metadata.whatsapp.whatsapp_user_id
    const wa = meta.whatsapp as Record<string, unknown> | undefined
    if (wa?.whatsapp_user_id) {
      const uid = wa.whatsapp_user_id as string
      const digits = uid.replace(/\D/g, "")
      if (digits.length >= 7) return formatPhoneNumber(uid)
    }

    // 3. Other metadata fields
    const phone =
      (meta.from_number as string) ||
      (meta.caller_id as string) ||
      ((meta.phone_call as Record<string, string> | undefined)?.external_number) ||
      ((meta.phone_call as Record<string, string> | undefined)?.from) ||
      (meta.initiator_identifier as string)
    if (phone) return formatPhoneNumber(phone)
  }

  return formatConvId(conv.conversation_id)
}

function formatConvId(id: string): string {
  // e.g. "conv_9401kkmng..." → "Conv 9401kk"
  const clean = id.replace(/^conv_/i, "")
  return "Conv " + clean.slice(0, 8).toUpperCase()
}

export function getStatusColor(status: string): string {
  const map: Record<string, string> = {
    PENDING: "badge--pending",
    APPROVED: "badge--approved",
    REJECTED: "badge--rejected",
    SUSPENDED: "badge--suspended",
    PENDING_REVIEW: "badge--pending",
    SETTING_UP: "badge--setup",
    ACTIVE: "badge--active",
    INACTIVE: "badge--inactive",
  }
  return map[status] ?? "badge--default"
}

export function getStatusLabel(status: string): string {
  const map: Record<string, string> = {
    PENDING: "Pending Verification",
    APPROVED: "Approved",
    REJECTED: "Rejected",
    SUSPENDED: "Suspended",
    PENDING_REVIEW: "Pending Review",
    SETTING_UP: "Setting Up",
    ACTIVE: "Active",
    INACTIVE: "Inactive",
  }
  return map[status] ?? status
}
