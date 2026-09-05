import { NextRequest, NextResponse } from "next/server"
import { authorizeOutreachAdmin } from "@/lib/outreach/adminAuth"
import { z } from "zod"
import { db } from "@/lib/db"

// Review actions on a drafted message: approve, reject, or edit-then-approve.
// The edit path exists because the useful review outcome is usually "almost
// right, one sentence is off" rather than a clean yes or no.

const bodySchema = z.object({
  id: z.string().min(1),
  action: z.enum(["approve", "reject"]),
  subject: z.string().min(1).max(120).optional(),
  bodyText: z.string().min(20).max(4000).optional(),
})

export async function PATCH(req: NextRequest) {
  const actor = await authorizeOutreachAdmin(req)
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    const errors: Record<string, string> = {}
    parsed.error.issues.forEach((issue) => {
      const field = issue.path[0] as string
      if (!errors[field]) errors[field] = issue.message
    })
    return NextResponse.json({ errors }, { status: 400 })
  }

  const { id, action, subject, bodyText } = parsed.data

  // Guarded update: only a still-pending row can be reviewed, so two open tabs
  // cannot approve and reject the same draft.
  const updated = await db.outreachMessage.updateMany({
    where: { id, status: "pending" },
    data: {
      status: action === "approve" ? "approved" : "rejected",
      reviewedAt: new Date(),
      ...(subject ? { subject } : {}),
      ...(bodyText ? { bodyText } : {}),
    },
  })
  if (updated.count === 0) {
    return NextResponse.json({ error: "Already reviewed" }, { status: 409 })
  }

  if (action === "reject") {
    const message = await db.outreachMessage.findUnique({
      where: { id },
      select: { prospectId: true },
    })
    if (message) {
      await db.outreachProspect.updateMany({
        where: { id: message.prospectId },
        data: { status: "new" },
      })
    }
  }

  return NextResponse.json({ ok: true })
}
