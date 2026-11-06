// Builds an iCalendar (RFC 5545) meeting invite for an appointment, attached to
// the "appointment booked" email so it lands in the owner's calendar (Gmail /
// Google Calendar, Outlook and Apple Calendar all read METHOD:REQUEST invites).
// Pure — no db or env — so it's shared-safe and unit-tested directly.

export interface CalendarInviteInput {
  uid: string                 // stable per appointment, so a later update/cancel can target it
  start: Date
  durationMinutes: number     // appointments store only a start instant
  summary: string
  description?: string | null
  organizerEmail: string
  organizerName: string
  attendeeEmail: string
  attendeeName?: string | null
  now?: Date
}

// UTC basic format, e.g. 20261008T130000Z.
export function icsDate(d: Date): string {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "")
}

// TEXT values must escape backslash, semicolon, comma and newlines.
export function icsEscape(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n")
}

// Lines longer than 75 octets must be folded (CRLF + a single space). Strict
// parsers (Outlook) reject an invite with unfolded long lines. Counts UTF-8
// bytes, not characters, and never splits a multi-byte character.
export function icsFold(line: string): string {
  const enc = new TextEncoder()
  if (enc.encode(line).length <= 75) return line
  const parts: string[] = []
  let current = ""
  let currentBytes = 0
  for (const ch of line) {
    const chBytes = enc.encode(ch).length
    // First line may hold 75 octets; continuations lose one to the leading space.
    const limit = parts.length === 0 ? 75 : 74
    if (currentBytes + chBytes > limit) {
      parts.push(current)
      current = ""
      currentBytes = 0
    }
    current += ch
    currentBytes += chBytes
  }
  parts.push(current)
  return parts.join("\r\n ")
}

export function buildAppointmentInvite(input: CalendarInviteInput): string {
  const end = new Date(input.start.getTime() + input.durationMinutes * 60_000)
  // CN is a param value: quote it so names with commas/colons stay one param.
  const cn = (name: string) => `"${name.replace(/"/g, "'")}"`
  const lines = [
    "BEGIN:VCALENDAR",
    "PRODID:-//Dailzero//Appointments//EN",
    "VERSION:2.0",
    "CALSCALE:GREGORIAN",
    "METHOD:REQUEST",
    "BEGIN:VEVENT",
    `UID:${input.uid}`,
    `DTSTAMP:${icsDate(input.now ?? new Date())}`,
    `DTSTART:${icsDate(input.start)}`,
    `DTEND:${icsDate(end)}`,
    `SUMMARY:${icsEscape(input.summary)}`,
    ...(input.description ? [`DESCRIPTION:${icsEscape(input.description)}`] : []),
    `ORGANIZER;CN=${cn(input.organizerName)}:mailto:${input.organizerEmail}`,
    `ATTENDEE;CN=${cn(input.attendeeName || input.attendeeEmail)};ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE:mailto:${input.attendeeEmail}`,
    "STATUS:CONFIRMED",
    "SEQUENCE:0",
    "BEGIN:VALARM",
    "TRIGGER:-PT30M",
    "ACTION:DISPLAY",
    `DESCRIPTION:${icsEscape(input.summary)}`,
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ]
  return lines.map(icsFold).join("\r\n") + "\r\n"
}
