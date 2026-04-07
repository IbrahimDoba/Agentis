import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import * as XLSX from "xlsx"

interface Params {
  params: Promise<{ id: string }>
}

function formatPhoneNumber(raw: string): string {
  const digits = raw.replace(/\D/g, "")
  if (digits.length === 11 && digits.startsWith("0")) {
    return `+${digits.slice(1)}`
  }
  if (digits.length > 10) {
    return `+${digits}`
  }
  return digits
}

function formatDate(date: Date | null): string {
  if (!date) return ""
  return date.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })
}

export async function GET(req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  const agent = await db.agent.findUnique({
    where: { id },
    select: { userId: true, elevenlabsAgentId: true, businessName: true },
  })

  if (!agent) return NextResponse.json({ error: "Agent not found" }, { status: 404 })

  const isOwner = agent.userId === session.user.id
  const isAdmin = session.user.role === "ADMIN"
  if (!isOwner && !isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  // Fetch all unique contacts with aggregated stats
  const groups = await db.conversationLog.groupBy({
    by: ["phoneNumber"],
    where: {
      phoneNumber: { not: null },
      OR: [
        { agentId: id },
        ...(agent.elevenlabsAgentId ? [{ elevenlabsAgentId: agent.elevenlabsAgentId }] : []),
      ],
    },
    _count: { conversationId: true },
    _sum: { durationSecs: true },
    _max: { startTime: true, createdAt: true },
    _min: { startTime: true, createdAt: true },
    orderBy: { _max: { createdAt: "desc" } },
  })

  // Fetch last conversation summary per phone
  const phoneNumbers = groups.map((g) => g.phoneNumber as string)
  const lastConvs = await db.conversationLog.findMany({
    where: {
      phoneNumber: { in: phoneNumbers },
      OR: [
        { agentId: id },
        ...(agent.elevenlabsAgentId ? [{ elevenlabsAgentId: agent.elevenlabsAgentId }] : []),
      ],
    },
    orderBy: { createdAt: "desc" },
    select: { phoneNumber: true, summary: true, rawPayload: true, createdAt: true },
  })

  // Map phone → most recent summary
  const summaryMap = new Map<string, string>()
  for (const conv of lastConvs) {
    if (!conv.phoneNumber) continue
    if (summaryMap.has(conv.phoneNumber)) continue
    const raw = conv.rawPayload as Record<string, any> | null
    const summary =
      conv.summary ??
      raw?.transcript_summary ??
      (raw?.analysis as Record<string, any> | undefined)?.transcript_summary ??
      null
    if (summary) summaryMap.set(conv.phoneNumber, summary)
  }

  // Build rows
  const rows = groups.map((g, index) => {
    const phone = g.phoneNumber as string
    const lastActive = g._max.startTime ?? g._max.createdAt
    const firstSeen = g._min.startTime ?? g._min.createdAt
    const totalSecs = g._sum.durationSecs ?? 0
    const totalMins = totalSecs > 0 ? Math.round(totalSecs / 60) : 0

    return {
      "#": index + 1,
      "Phone Number": formatPhoneNumber(phone),
      "Raw Number": phone,
      "Total Chats": g._count.conversationId,
      "Total Talk Time (mins)": totalMins,
      "First Contact": formatDate(firstSeen),
      "Last Contact": formatDate(lastActive),
      "Last Conversation Summary": summaryMap.get(phone) ?? "",
    }
  })

  // Build workbook
  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.json_to_sheet(rows)

  // Column widths
  ws["!cols"] = [
    { wch: 5 },   // #
    { wch: 18 },  // Phone Number
    { wch: 16 },  // Raw Number
    { wch: 12 },  // Total Chats
    { wch: 22 },  // Total Talk Time
    { wch: 20 },  // First Contact
    { wch: 20 },  // Last Contact
    { wch: 60 },  // Last Conversation Summary
  ]

  XLSX.utils.book_append_sheet(wb, ws, "Contacts")

  // Add a metadata sheet
  const metaRows = [
    { Field: "Agent", Value: agent.businessName },
    { Field: "Exported At", Value: new Date().toLocaleString("en-GB", { hour12: false }) },
    { Field: "Total Contacts", Value: rows.length },
  ]
  const metaWs = XLSX.utils.json_to_sheet(metaRows)
  metaWs["!cols"] = [{ wch: 18 }, { wch: 40 }]
  XLSX.utils.book_append_sheet(wb, metaWs, "Info")

  const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" })

  const filename = `contacts_${agent.businessName.replace(/\s+/g, "_")}_${new Date().toISOString().slice(0, 10)}.xlsx`

  return new NextResponse(buffer, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  })
}
