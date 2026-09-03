import { withAdmin } from "@/lib/api/withAuth"
import { NextRequest, NextResponse } from "next/server"
import { randomBytes } from "node:crypto"
import { z } from "zod"
import { db } from "@/lib/db"
import { personalize } from "@/lib/outreach/personalize"
import { provisionDemo, type DemoSeed } from "@/lib/outreach/demo"
import { suppressionReason } from "@/lib/outreach/suppression"
import { OUTREACH_APP_URL, clickUrl } from "@/lib/outreach/render"
import { FIT_THRESHOLD } from "@/lib/outreach/fit"

// Provisions a mirror demo and drafts step 1 for a batch of prospects.
// Everything it produces lands in the review queue as `pending`; nothing here
// can put mail on the wire.

export const maxDuration = 300

const bodySchema = z.object({
  limit: z.number().int().min(1).max(25).default(5),
  prospectIds: z.array(z.string()).max(25).optional(),
})

type Research = {
  pages?: { url: string; text: string }[]
  seed?: DemoSeed
}

export const POST = withAdmin(async (req: NextRequest) => {
  const parsed = bodySchema.safeParse((await req.json().catch(() => null)) ?? {})
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 })

  const prospects = await db.outreachProspect.findMany({
    where: parsed.data.prospectIds
      ? { id: { in: parsed.data.prospectIds } }
      : { status: "new", fitScore: { gte: FIT_THRESHOLD } },
    orderBy: { fitScore: "desc" },
    take: parsed.data.limit,
  })

  const results: { id: string; businessName: string; outcome: string; detail?: string }[] = []

  // Serial rather than Promise.all: this provisions agents and spends model
  // tokens, and a partial batch that stops cleanly beats twenty concurrent
  // failures with half-built demos behind them.
  for (const prospect of prospects) {
    // Re-checked here so a suppression that landed after import never becomes a
    // demo agent and a Claude call.
    const blocked = await suppressionReason(prospect.email)
    if (blocked) {
      await db.outreachProspect.update({
        where: { id: prospect.id },
        data: { status: "disqualified", disqualifiedReason: blocked },
      })
      results.push({ id: prospect.id, businessName: prospect.businessName, outcome: "suppressed", detail: blocked })
      continue
    }

    const research = (prospect.research ?? {}) as Research
    if (!research.seed) {
      results.push({
        id: prospect.id,
        businessName: prospect.businessName,
        outcome: "skipped",
        detail: "no demo seed in research — run enrichment first",
      })
      continue
    }

    let demoSlugValue = prospect.demoSlug
    if (!prospect.demoAgentId) {
      const provisioned = await provisionDemo(prospect.id, research.seed)
      if (!provisioned.ok) {
        results.push({
          id: prospect.id,
          businessName: prospect.businessName,
          outcome: "demo failed",
          detail: provisioned.reason,
        })
        continue
      }
      demoSlugValue = provisioned.slug
    }

    // The token is minted before generation because the demo URL has to be in
    // the prompt: the model is told to place that exact string and validation
    // rejects any other link.
    const token = randomBytes(18).toString("base64url")
    const demoUrl = clickUrl(token)

    const generated = await personalize({
      businessName: prospect.businessName,
      vertical: prospect.vertical,
      city: prospect.city,
      website: prospect.website,
      instagram: prospect.instagram,
      contactName: prospect.contactName,
      sourceLabel: prospect.sourceLabel,
      fetchedPages: research.pages ?? [],
      demoUrl,
    })

    if (!generated.ok) {
      results.push({
        id: prospect.id,
        businessName: prospect.businessName,
        outcome: "rejected",
        detail: generated.failures.join("; "),
      })
      continue
    }

    await db.outreachMessage.create({
      data: {
        prospectId: prospect.id,
        step: 1,
        toEmail: prospect.email,
        subject: generated.copy.subject,
        bodyText: `${generated.copy.body}\n\n${generated.copy.sourceDisclosure}`,
        aiReason: generated.reason,
        aiSignals: generated.copy.observedSignals,
        aiModel: generated.model,
        status: "pending",
        token,
      },
    })
    await db.outreachProspect.update({
      where: { id: prospect.id },
      data: { status: "queued" },
    })

    results.push({
      id: prospect.id,
      businessName: prospect.businessName,
      outcome: "drafted",
      detail: `${OUTREACH_APP_URL}/demo/${demoSlugValue}`,
    })
  }

  return NextResponse.json({
    processed: results.length,
    drafted: results.filter((r) => r.outcome === "drafted").length,
    results,
  })
})
