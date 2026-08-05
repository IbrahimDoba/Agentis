import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { getWorkspaceContext } from "@/lib/workspace"
import type { Prisma } from "@/generated/prisma/client"

interface Params { params: Promise<{ id: string }> }

const REMINDER_MAX = 7 * 24 * 60

const patchSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  scheduledAt: z.string().datetime({ offset: true }).optional(),
  status: z.enum(["SCHEDULED", "COMPLETED", "CANCELLED", "NO_SHOW"]).optional(),
  notes: z.string().trim().max(1000).nullable().optional(),
  customerName: z.string().trim().max(200).nullable().optional(),
  customerNumber: z.string().trim().max(40).nullable().optional(),
  reminder1Minutes: z.number().int().min(1).max(REMINDER_MAX).optional(),
  reminder2Minutes: z.number().int().min(1).max(REMINDER_MAX).nullable().optional(),
})

// PATCH /api/appointments/[id] — reschedule, change status, edit details or
// reminder lead times. Rescheduling clears the sent-stamps so reminders re-fire.
export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { ownerId } = await getWorkspaceContext(session.user.id)
  const { id } = await params

  const existing = await db.appointment.findUnique({ where: { id }, select: { userId: true, scheduledAt: true } })
  if (!existing || existing.userId !== ownerId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  const parsed = patchSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body", details: parsed.error.flatten() }, { status: 400 })
  }
  const b = parsed.data

  const data: Prisma.AppointmentUpdateInput = {}
  if (b.title !== undefined) data.title = b.title
  if (b.status !== undefined) data.status = b.status
  if (b.notes !== undefined) data.notes = b.notes
  if (b.customerName !== undefined) data.customerName = b.customerName
  if (b.customerNumber !== undefined) data.customerNumber = b.customerNumber
  if (b.reminder1Minutes !== undefined) data.reminder1Minutes = b.reminder1Minutes
  if (b.reminder2Minutes !== undefined) data.reminder2Minutes = b.reminder2Minutes

  if (b.scheduledAt !== undefined) {
    const when = new Date(b.scheduledAt)
    if (when.getTime() < Date.now() - 60_000) {
      return NextResponse.json({ error: "scheduledAt must be in the future" }, { status: 400 })
    }
    // Moving the time re-arms both reminders for the new schedule.
    if (when.getTime() !== existing.scheduledAt.getTime()) {
      data.scheduledAt = when
      data.reminder1SentAt = null
      data.reminder2SentAt = null
    }
  }

  try {
    const appointment = await db.appointment.update({ where: { id }, data })
    return NextResponse.json({ appointment })
  } catch (error) {
    console.error("[PATCH /api/appointments/[id]]", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

// DELETE /api/appointments/[id]
export async function DELETE(_req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { ownerId } = await getWorkspaceContext(session.user.id)
  const { id } = await params

  const existing = await db.appointment.findUnique({ where: { id }, select: { userId: true } })
  if (!existing || existing.userId !== ownerId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  await db.appointment.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
