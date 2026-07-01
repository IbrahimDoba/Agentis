import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"

interface Params {
  params: Promise<{ id: string }>
}

// Normalize a stored WhatsApp number to +E.164 for phone import.
// Mirrors the xlsx export's heuristic (Nigeria 0-prefix → +, long → +digits).
function toE164(raw: string): string | null {
  const digits = raw.replace(/\D/g, "")
  if (digits.length === 11 && digits.startsWith("0")) return `+${digits.slice(1)}`
  if (digits.length >= 10 && digits.length <= 15) return `+${digits}`
  return null // too short / junk / unrenderable as a real number
}

// vCard text values must escape \ ; , and newlines.
function vcardEscape(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n").trim()
}

// adContext is a JSON? column; the Neon adapter can hand it back as a string on
// some driver paths, so parse defensively before reading `.title`.
function adTitle(adContext: unknown): string | null {
  if (!adContext) return null
  let obj = adContext
  if (typeof obj === "string") {
    try { obj = JSON.parse(obj) } catch { return null }
  }
  const t = (obj as { title?: unknown } | null)?.title
  return typeof t === "string" && t.trim() ? t.trim() : null
}

function fmtDate(d: Date | null): string {
  if (!d) return ""
  return new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
}

export async function GET(_req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  const agent = await db.agent.findUnique({
    where: { id },
    select: { userId: true, businessName: true },
  })
  if (!agent) return NextResponse.json({ error: "Agent not found" }, { status: 404 })
  if (agent.userId !== session.user.id && session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  // Every WhatsApp number that has messaged this agent (one row per number).
  // Embed-widget visitors are excluded — they have no real phone number.
  const convs = await db.conversation.findMany({
    where: { agentId: id, channel: "whatsapp", phoneNumber: { not: "" } },
    select: { phoneNumber: true, contactName: true, adContext: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  })

  const cards: string[] = []
  for (const c of convs) {
    const tel = toE164(c.phoneNumber)
    if (!tel) continue

    const base = c.contactName?.trim()
    const name = base ? `${base} (WA Lead)` : `WA Lead ${tel}`

    const ad = adTitle(c.adContext)
    const noteParts = ["WhatsApp lead"]
    if (ad) noteParts.push(ad)
    const first = fmtDate(c.createdAt)
    if (first) noteParts.push(`first contacted ${first}`)
    const note = noteParts.join(" · ")

    cards.push(
      [
        "BEGIN:VCARD",
        "VERSION:3.0",
        `N:;${vcardEscape(name)};;;`,
        `FN:${vcardEscape(name)}`,
        `TEL;TYPE=CELL:${tel}`,
        `NOTE:${vcardEscape(note)}`,
        "END:VCARD",
      ].join("\r\n")
    )
  }

  const body = cards.join("\r\n") + (cards.length ? "\r\n" : "")
  const filename = `leads_${agent.businessName.replace(/\s+/g, "_")}_${new Date().toISOString().slice(0, 10)}.vcf`

  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "text/vcard; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "X-Contact-Count": String(cards.length),
    },
  })
}
