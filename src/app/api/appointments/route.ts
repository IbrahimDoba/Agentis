import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { getWorkspaceContext } from "@/lib/workspace"

const REMINDER_MAX = 7 * 24 * 60 // a week, in minutes

// GET /api/appointments — all appointments for the active workspace, upcoming
// first. Read-only serialization (dates → ISO) for the client component.
export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { ownerId } = await getWorkspaceContext(session.user.id)

  const appointments = await db.appointment.findMany({
    where: { userId: ownerId },
    include: { agent: { select: { businessName: true, profileImageUrl: true } } },
    orderBy: { scheduledAt: "asc" },
  })

  return NextResponse.json({
    appointments: appointments.map((a) => ({
      id: a.id,
      agentId: a.agentId,
      conversationId: a.conversationId,
      customerName: a.customerName,
      customerNumber: a.customerNumber,
      title: a.title,
      notes: a.notes,
      scheduledAt: a.scheduledAt.toISOString(),
      status: a.status,
      createdBy: a.createdBy,
      reminder1Minutes: a.reminder1Minutes,
      reminder2Minutes: a.reminder2Minutes,
      createdAt: a.createdAt.toISOString(),
      agent: a.agent,
    })),
  })
}

const createSchema = z.object({
  agentId: z.string().min(1),
  title: z.string().trim().min(1).max(200),
  scheduledAt: z.string().datetime({ offset: true }),
  customerName: z.string().trim().max(200).optional().nullable(),
  customerNumber: z.string().trim().max(40).optional().nullable(),
  notes: z.string().trim().max(1000).optional().nullable(),
  conversationId: z.string().optional().nullable(),
  reminder1Minutes: z.number().int().min(1).max(REMINDER_MAX).optional(),
  reminder2Minutes: z.number().int().min(1).max(REMINDER_MAX).nullable().optional(),
})

// POST /api/appointments — manual (human) appointment creation from the dashboard.
export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { ownerId } = await getWorkspaceContext(session.user.id)

  const parsed = createSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body", details: parsed.error.flatten() }, { status: 400 })
  }
  const b = parsed.data

  const scheduledAt = new Date(b.scheduledAt)
  if (scheduledAt.getTime() < Date.now() - 60_000) {
    return NextResponse.json({ error: "scheduledAt must be in the future" }, { status: 400 })
  }

  // The agent must belong to the active workspace owner (tenant scope).
  const agent = await db.agent.findUnique({ where: { id: b.agentId }, select: { userId: true } })
  if (!agent || agent.userId !== ownerId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  // Reminder lead times fall back to the account defaults when not overridden.
  const owner = await db.user.findUnique({
    where: { id: ownerId },
    select: { appointmentReminder1Minutes: true, appointmentReminder2Minutes: true },
  })

  try {
    const appointment = await db.appointment.create({
      data: {
        agentId: b.agentId,
        userId: ownerId,
        conversationId: b.conversationId ?? null,
        customerName: b.customerName ?? null,
        customerNumber: b.customerNumber ?? null,
        title: b.title,
        notes: b.notes ?? null,
        scheduledAt,
        createdBy: "human",
        reminder1Minutes: b.reminder1Minutes ?? owner?.appointmentReminder1Minutes ?? 60,
        // Preserve a null account default (single reminder) when not overridden.
        reminder2Minutes: b.reminder2Minutes !== undefined ? b.reminder2Minutes : (owner ? owner.appointmentReminder2Minutes : 15),
      },
    })
    return NextResponse.json({ appointment }, { status: 201 })
  } catch (error) {
    console.error("[POST /api/appointments]", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
