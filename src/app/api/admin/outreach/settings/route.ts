import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { auth } from "@/lib/auth"
import { getOutreachSettings, updateOutreachSettings, LIMITS } from "@/lib/outreach/settings"

// Campaign settings an operator changes while a campaign is running. Secrets are
// deliberately absent: the SMTP password, the mailbox we authenticate as and the
// root-domain safety flag stay in env, where changing them needs a deploy.

const bodySchema = z.object({
  dailyCap: z.number().int().min(LIMITS.dailyCap.min).max(LIMITS.dailyCap.max).optional(),
  hourlyCap: z.number().int().min(LIMITS.hourlyCap.min).max(LIMITS.hourlyCap.max).optional(),
  sliceSize: z.number().int().min(LIMITS.sliceSize.min).max(LIMITS.sliceSize.max).optional(),
  // Empty string clears it, which returns sending to the day-one ramp value
  // rather than removing the ramp.
  warmupStartedAt: z.string().optional().nullable(),
  whatsappNumber: z.string().max(20).optional().nullable(),
  fromName: z.string().min(1).max(60).optional(),
  signerName: z.string().min(1).max(60).optional(),
  signerTitle: z.string().min(1).max(80).optional(),
  warmupEnabled: z.boolean().optional(),
  htmlEnabled: z.boolean().optional(),
  logoUrl: z.string().url().optional().nullable().or(z.literal("")),
  sendingEnabled: z.boolean().optional(),
})

export async function GET() {
  const session = await auth()
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  return NextResponse.json({ settings: await getOutreachSettings(), limits: LIMITS })
}

export async function PATCH(req: NextRequest) {
  const session = await auth()
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    const errors: Record<string, string> = {}
    parsed.error.issues.forEach((i) => {
      const k = i.path.join(".")
      if (!errors[k]) errors[k] = i.message
    })
    return NextResponse.json({ errors }, { status: 400 })
  }

  const { warmupStartedAt, whatsappNumber, logoUrl, ...rest } = parsed.data
  const patch: Record<string, unknown> = { ...rest }

  if (warmupStartedAt !== undefined) {
    if (!warmupStartedAt) patch.warmupStartedAt = null
    else {
      const d = new Date(warmupStartedAt)
      if (Number.isNaN(d.getTime())) {
        return NextResponse.json({ errors: { warmupStartedAt: "Not a date" } }, { status: 400 })
      }
      patch.warmupStartedAt = d
    }
  }
  // Stored digits-only so wa.me links are built from a canonical value rather
  // than whatever shape it was typed in.
  if (whatsappNumber !== undefined) {
    patch.whatsappNumber = whatsappNumber ? whatsappNumber.replace(/\D/g, "") || null : null
  }
  if (logoUrl !== undefined) patch.logoUrl = logoUrl || null

  const settings = await updateOutreachSettings(patch, session.user.email ?? "admin")
  return NextResponse.json({ settings })
}
