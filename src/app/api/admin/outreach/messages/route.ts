import { NextRequest, NextResponse } from "next/server"
import { authorizeOutreachAdmin } from "@/lib/outreach/adminAuth"
import { z } from "zod"
import { db } from "@/lib/db"

// Review actions on a drafted message: approve, reject, or edit-then-approve.
// The edit path exists because the useful review outcome is usually "almost
// right, one sentence is off" rather than a clean yes or no.

// Mirrors the status values OutreachMessage documents in the schema. Checked
// rather than passed through, so a typo returns 400 instead of an empty list
// that reads as "nothing to approve".
const STATUSES = new Set([
  "pending", "approved", "rejected", "sending", "sent", "failed", "skipped",
])

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

/**
 * Lists drafts by status. The review queue renders server-side and never needed
 * this, but approving from a script does: PATCH takes a message id, and until
 * now nothing outside the page could learn one.
 */
export async function GET(req: NextRequest) {
  const actor = await authorizeOutreachAdmin(req)
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const status = req.nextUrl.searchParams.get("status") ?? "pending"
  if (!STATUSES.has(status)) {
    return NextResponse.json({ error: `Unknown status: ${status}` }, { status: 400 })
  }

  const messages = await db.outreachMessage.findMany({
    where: { status },
    orderBy: { createdAt: "asc" },
    take: 200,
    select: {
      id: true,
      step: true,
      subject: true,
      toEmail: true,
      status: true,
      sentAt: true,
      error: true,
      prospect: { select: { businessName: true, city: true, fitScore: true } },
    },
  })

  return NextResponse.json({
    count: messages.length,
    messages: messages.map((m) => ({
      id: m.id,
      step: m.step,
      subject: m.subject,
      toEmail: m.toEmail,
      status: m.status,
      sentAt: m.sentAt?.toISOString() ?? null,
      error: m.error,
      businessName: m.prospect.businessName,
      city: m.prospect.city,
      fitScore: m.prospect.fitScore,
    })),
  })
}
