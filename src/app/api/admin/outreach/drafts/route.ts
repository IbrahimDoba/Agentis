import { NextRequest, NextResponse } from "next/server"
import { randomBytes } from "node:crypto"
import { z } from "zod"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { validateCopy } from "@/lib/outreach/validate"
import { clickUrl } from "@/lib/outreach/render"
import { suppressionReason } from "@/lib/outreach/suppression"

// Accepts copy written outside the app — currently by Claude Code, working from
// each prospect's own website and socials — and lands it in the review queue.
//
// The alternative is src/lib/outreach/personalize.ts, which calls the model from
// the server. That is the right shape at volume; at a 200-prospect pilot it adds
// an API key, a bill and a research step that a session with web access already
// does better. Both paths converge on the same OutreachMessage rows, so the
// review, send and suppression machinery does not care which produced them.
//
// Copy arriving this way is NOT trusted: it runs the same validate.ts gates as
// model output, because the failure modes (an unverifiable claim, a second link,
// a missing disclosure) are identical regardless of who typed it.

const draftSchema = z.object({
  prospectId: z.string().min(1),
  subject: z.string().min(1).max(120),
  body: z.string().min(20).max(4000),
  sourceDisclosure: z.string().min(5).max(300),
  reason: z.string().max(500).optional(),
  observedSignals: z
    .array(z.object({ claim: z.string().min(1), sourceUrl: z.string().url() }))
    .min(1),
  // Hosts actually fetched while researching. A signal citing anything else is
  // rejected, which is what keeps "personalized" from sliding into "invented".
  fetchedHosts: z.array(z.string().min(1)).min(1),
})

const bodySchema = z.object({
  drafts: z.array(draftSchema).min(1).max(50),
  step: z.number().int().min(1).max(4).default(1),
})

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    const errors: Record<string, string> = {}
    parsed.error.issues.forEach((issue) => {
      const path = issue.path.join(".")
      if (!errors[path]) errors[path] = issue.message
    })
    return NextResponse.json({ errors }, { status: 400 })
  }

  const { drafts, step } = parsed.data
  const created: string[] = []
  const rejected: { prospectId: string; reason: string }[] = []

  for (const draft of drafts) {
    const prospect = await db.outreachProspect.findUnique({
      where: { id: draft.prospectId },
      select: { id: true, email: true, sourceLabel: true, demoSlug: true, demoExpiresAt: true },
    })
    if (!prospect) {
      rejected.push({ prospectId: draft.prospectId, reason: "prospect not found" })
      continue
    }

    const blocked = await suppressionReason(prospect.email)
    if (blocked) {
      rejected.push({ prospectId: draft.prospectId, reason: blocked })
      continue
    }

    // Mint the token first: the click URL is derived from it, and the copy must
    // contain that exact string for validation to pass. Where it lands is decided
    // at click time by /r/<token> — the prospect's WhatsApp conversation, their
    // demo if one exists, otherwise their vertical's solutions page.
    const token = randomBytes(18).toString("base64url")
    const linkUrl = clickUrl(token)

    const verdict = validateCopy(
      {
        subject: draft.subject,
        body: draft.body,
        sourceDisclosure: draft.sourceDisclosure,
        observedSignals: draft.observedSignals,
      },
      { fetchedHosts: draft.fetchedHosts, sourceLabel: prospect.sourceLabel, demoUrl: linkUrl }
    )
    if (!verdict.ok) {
      rejected.push({ prospectId: draft.prospectId, reason: verdict.failures.join("; ") })
      continue
    }

    try {
      await db.outreachMessage.create({
        data: {
          prospectId: prospect.id,
          step,
          toEmail: prospect.email,
          subject: draft.subject,
          bodyText: `${draft.body}\n\n${draft.sourceDisclosure}`,
          aiReason: draft.reason ?? null,
          aiSignals: draft.observedSignals,
          aiModel: "claude-code",
          status: "pending",
          token,
        },
      })
      await db.outreachProspect.update({ where: { id: prospect.id }, data: { status: "queued" } })
      created.push(prospect.id)
    } catch {
      // Unique on [prospectId, step] — regenerating a step that already has a
      // draft is a no-op, not an error.
      rejected.push({ prospectId: draft.prospectId, reason: `step ${step} already drafted` })
    }
  }

  return NextResponse.json({ created: created.length, rejected: rejected.length, details: rejected })
}

/** The prospects still needing copy, with everything needed to research them. */
export async function GET() {
  const session = await auth()
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const prospects = await db.outreachProspect.findMany({
    where: { status: "new" },
    orderBy: { fitScore: "desc" },
    take: 50,
    select: {
      id: true,
      businessName: true,
      vertical: true,
      city: true,
      website: true,
      instagram: true,
      contactName: true,
      sourceLabel: true,
      sourceUrl: true,
      fitScore: true,
      demoSlug: true,
    },
  })

  return NextResponse.json({ prospects })
}
