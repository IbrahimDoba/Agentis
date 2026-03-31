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

  // Country code lookup: maps prefix → { ccLen, groups }
  // groups = how to split the subscriber number after the country code
  const patterns: Array<{ prefix: string; groups: number[] }> = [
    { prefix: "234", groups: [3, 3, 4] },  // Nigeria   +234 XXX XXX XXXX
    { prefix: "1",   groups: [3, 3, 4] },  // US/Canada +1 XXX XXX XXXX
    { prefix: "44",  groups: [4, 3, 4] },  // UK        +44 XXXX XXX XXXX
    { prefix: "27",  groups: [2, 3, 4] },  // South Africa
    { prefix: "254", groups: [3, 3, 3] },  // Kenya
    { prefix: "233", groups: [2, 3, 4] },  // Ghana
    { prefix: "255", groups: [3, 3, 3] },  // Tanzania
  ]

  for (const { prefix, groups } of patterns) {
    if (digits.startsWith(prefix)) {
      const subscriber = digits.slice(prefix.length)
      const parts: string[] = []
      let pos = 0
      for (const len of groups) {
        if (pos >= subscriber.length) break
        parts.push(subscriber.slice(pos, pos + len))
        pos += len
      }
      // Append any leftover digits
      if (pos < subscriber.length) parts.push(subscriber.slice(pos))
      return `+${prefix} ${parts.join(" ")}`
    }
  }

  // Generic fallback: just prepend + and group in 3s
  return "+" + digits.replace(/(\d{3})(?=\d)/g, "$1 ").trim()
}

export function getCallerIdentifier(conv: {
  user_id?: string | null
  metadata?: Record<string, unknown>
  conversation_id: string
}): string {
  // Metadata fields have the real phone number — check these first
  const meta = conv.metadata as Record<string, unknown> | undefined
  if (meta) {
    const phone =
      (meta.from_number as string) ||
      (meta.caller_id as string) ||
      ((meta.phone_call as Record<string, string> | undefined)?.external_number) ||
      ((meta.phone_call as Record<string, string> | undefined)?.from) ||
      (meta.initiator_identifier as string)
    if (phone) return formatPhoneNumber(phone)
  }

  // Only use user_id if it looks like a real phone number (7+ digits)
  if (conv.user_id) {
    const digits = conv.user_id.replace(/\D/g, "")
    if (digits.length >= 7) return formatPhoneNumber(conv.user_id)
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
