import { withAdmin } from "@/lib/api/withAuth"
import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { db } from "@/lib/db"
import { parseCsvRows } from "@/lib/outreach/csv"
import { filterSuppressed } from "@/lib/outreach/suppression"
import { scoreFit, FIT_THRESHOLD } from "@/lib/outreach/fit"
import {
  normalizeEmail,
  normalizeNgPhone,
  normalizeWebsite,
  normalizeInstagram,
  emailDomain,
  hashEmail,
  titleCase,
} from "@/lib/outreach/normalize"

// Imports a VA-built prospect spreadsheet. Every row is normalized, scored and
// checked against the suppression list here rather than at send time, so a bad
// row costs nothing downstream: no Claude call, no demo agent, no email.

const bodySchema = z.object({
  csv: z.string().min(10).max(2_000_000),
  vertical: z.string().max(40).optional(),
})

type RowOutcome = { email: string; outcome: string }

export const POST = withAdmin(async (req: NextRequest) => {
  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: "csv is required" }, { status: 400 })
  }

  const rows = parseCsvRows(parsed.data.csv)
  if (rows.length === 0) {
    return NextResponse.json({ error: "No data rows found" }, { status: 400 })
  }

  const skipped: RowOutcome[] = []
  const candidates: {
    email: string
    data: Parameters<typeof db.outreachProspect.create>[0]["data"]
  }[] = []

  for (const row of rows) {
    const email = normalizeEmail(row.email ?? "")
    const businessName = (row.businessname ?? "").trim()
    const sourceLabel = (row.sourcelabel ?? "").trim()
    const sourceUrl = (row.sourceurl ?? "").trim()

    if (!email) {
      skipped.push({ email: row.email ?? "(blank)", outcome: "unparseable email" })
      continue
    }
    if (!businessName) {
      skipped.push({ email, outcome: "missing businessName" })
      continue
    }
    // Enforced at the door, not at send: without both we cannot write the
    // "where I found you" sentence the NDPA position depends on.
    if (!sourceLabel || !sourceUrl) {
      skipped.push({ email, outcome: "missing sourceLabel or sourceUrl" })
      continue
    }

    const whatsappNumber = normalizeNgPhone(row.whatsapp ?? row.phone ?? "")
    const website = normalizeWebsite(row.website ?? "")
    const instagram = normalizeInstagram(row.instagram ?? "")
    const reviewCount = Number.isFinite(Number(row.reviewcount)) ? Number(row.reviewcount) : null

    const fit = scoreFit({
      vertical: parsed.data.vertical ?? row.vertical ?? null,
      city: row.city ?? null,
      whatsappNumber,
      website,
      instagram,
      reviewCount,
      research: {
        hasPriceList: truthy(row.haspricelist),
        sellsInDms: truthy(row.sellsindms),
        branchCount: Number.isFinite(Number(row.branchcount)) ? Number(row.branchcount) : null,
      },
    })

    if (fit.disqualified) {
      skipped.push({ email, outcome: `disqualified: ${fit.disqualifiedReason}` })
      continue
    }
    if (fit.score < FIT_THRESHOLD) {
      skipped.push({ email, outcome: `fit ${fit.score} below ${FIT_THRESHOLD}` })
      continue
    }

    candidates.push({
      email,
      data: {
        businessName,
        email,
        emailDomain: emailDomain(email),
        emailHash: hashEmail(email),
        contactName: row.contactname ? titleCase(row.contactname) : null,
        vertical: parsed.data.vertical ?? row.vertical ?? null,
        city: row.city ? titleCase(row.city) : null,
        phone: normalizeNgPhone(row.phone ?? ""),
        whatsappNumber,
        website,
        instagram,
        sourceLabel,
        sourceUrl,
        fitScore: fit.score,
        research: { reasons: fit.reasons, reviewCount },
        status: "new",
      },
    })
  }

  // One bulk query for the whole batch rather than one per row.
  const suppressed = await filterSuppressed(candidates.map((c) => c.email))

  let imported = 0
  let duplicate = 0
  for (const candidate of candidates) {
    if (suppressed.has(candidate.email)) {
      skipped.push({ email: candidate.email, outcome: "suppressed or existing customer" })
      continue
    }
    try {
      await db.outreachProspect.create({ data: candidate.data })
      imported++
    } catch {
      // Unique violation on email or emailHash. Re-importing an overlapping
      // spreadsheet is routine, so a duplicate is an outcome, not an error.
      duplicate++
      skipped.push({ email: candidate.email, outcome: "already imported" })
    }
  }

  return NextResponse.json({
    rows: rows.length,
    imported,
    duplicate,
    skipped: skipped.length,
    details: skipped.slice(0, 100),
  })
})

function truthy(value: string | undefined): boolean {
  if (!value) return false
  return ["1", "true", "yes", "y"].includes(value.trim().toLowerCase())
}
