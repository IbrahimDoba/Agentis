import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"

interface Params {
  params: Promise<{ id: string }>
}

// Normalize a stored WhatsApp number to +E.164 (mirrors the vCard export).
function toE164(raw: string): string | null {
  const digits = raw.replace(/\D/g, "")
  if (digits.length === 11 && digits.startsWith("0")) return `+${digits.slice(1)}`
  if (digits.length >= 10 && digits.length <= 15) return `+${digits}`
  return null
}

// adContext is JSON? — the Neon adapter can return it as a string; parse defensively.
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

// Always-quote CSV escaping so commas/quotes/newlines in names or ad titles are safe.
function csv(v: string): string {
  return `"${v.replace(/"/g, '""')}"`
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

  const convs = await db.conversation.findMany({
    where: { agentId: id, channel: "whatsapp", phoneNumber: { not: "" } },
    select: { phoneNumber: true, contactName: true, adContext: true, createdAt: true, lastActivityAt: true },
    orderBy: { createdAt: "desc" },
  })

  const header = ["Name", "Phone", "Raw Number", "First Contacted", "Last Active", "Source Ad"]
  const lines = [header.map(csv).join(",")]

  for (const c of convs) {
    const tel = toE164(c.phoneNumber)
    if (!tel) continue
    lines.push(
      [
        c.contactName?.trim() ?? "",
        tel,
        c.phoneNumber,
        fmtDate(c.createdAt),
        fmtDate(c.lastActivityAt),
        adTitle(c.adContext) ?? "",
      ].map(csv).join(",")
    )
  }

  // Prepend a UTF-8 BOM so Excel opens accented names / non-ASCII correctly.
  const body = "﻿" + lines.join("\r\n") + "\r\n"
  const filename = `leads_${agent.businessName.replace(/\s+/g, "_")}_${new Date().toISOString().slice(0, 10)}.csv`

  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "X-Contact-Count": String(lines.length - 1),
    },
  })
}
