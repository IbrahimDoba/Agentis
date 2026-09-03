import { db } from "@/lib/db"
import { parseWarmupStart } from "./warmup"

// Campaign settings, read from the database rather than the environment.
//
// The env vars are still honoured, but only as the seed for the first row. Once
// that row exists the database wins, so changing a cap is a form submission
// rather than a redeploy. That matters because the usual reason to change one is
// "something looks wrong and I want it slower right now".
//
// Secrets are NOT here. The SMTP password, the mailbox we authenticate as and
// the unsubscribe signing key stay in env, as does OUTREACH_ALLOW_ROOT_DOMAIN:
// a safety flag that can be flipped from a web form is not much of a safety flag.

export type OutreachSettings = {
  dailyCap: number
  hourlyCap: number
  sliceSize: number
  warmupEnabled: boolean
  warmupStartedAt: Date | null
  whatsappNumber: string | null
  fromName: string
  signerName: string
  signerTitle: string
  htmlEnabled: boolean
  logoUrl: string | null
  sendingEnabled: boolean
}

// Bounds applied on write. Generous enough not to get in the way, tight enough
// that a slipped digit cannot turn 50 a day into 5000.
export const LIMITS = {
  dailyCap: { min: 0, max: 500 },
  hourlyCap: { min: 0, max: 100 },
  sliceSize: { min: 1, max: 50 },
} as const

function envSeed(): OutreachSettings {
  return {
    dailyCap: Number(process.env.OUTREACH_DAILY_CAP ?? 10),
    hourlyCap: Number(process.env.OUTREACH_HOURLY_CAP ?? 5),
    sliceSize: Number(process.env.OUTREACH_SLICE_SIZE ?? 3),
    warmupEnabled: process.env.OUTREACH_WARMUP !== "false",
    warmupStartedAt: parseWarmupStart(process.env.OUTREACH_WARMUP_STARTED_AT),
    whatsappNumber: process.env.OUTREACH_WHATSAPP_NUMBER?.replace(/\D/g, "") || null,
    fromName: process.env.OUTREACH_FROM_NAME ?? "Dailzero",
    signerName: process.env.OUTREACH_SIGNER_NAME ?? "Ibrahim Doba",
    signerTitle: process.env.OUTREACH_SIGNER_TITLE ?? "CEO, Dailzero",
    htmlEnabled: process.env.OUTREACH_HTML !== "false",
    logoUrl: process.env.OUTREACH_LOGO_URL || null,
    sendingEnabled: true,
  }
}

// Every message in a slice reads these, so a short cache keeps one send run from
// issuing a query per email. Short enough that a cap lowered in the admin takes
// effect on the next cron tick rather than the next deploy.
const TTL_MS = 30_000
let cached: { at: number; value: OutreachSettings } | null = null

export function invalidateOutreachSettings() {
  cached = null
}

export async function getOutreachSettings(): Promise<OutreachSettings> {
  if (cached && Date.now() - cached.at < TTL_MS) return cached.value

  const seed = envSeed()
  let row
  try {
    row = await db.outreachSettings.upsert({
      where: { id: "default" },
      create: {
        id: "default",
        dailyCap: seed.dailyCap,
        hourlyCap: seed.hourlyCap,
        sliceSize: seed.sliceSize,
        warmupEnabled: seed.warmupEnabled,
        warmupStartedAt: seed.warmupStartedAt,
        whatsappNumber: seed.whatsappNumber,
        fromName: seed.fromName,
        signerName: seed.signerName,
        signerTitle: seed.signerTitle,
        htmlEnabled: seed.htmlEnabled,
        logoUrl: seed.logoUrl,
      },
      update: {},
    })
  } catch {
    // A settings read must never be the reason a send fails. Falling back to env
    // keeps the previous behaviour rather than stopping the campaign.
    return seed
  }

  const value: OutreachSettings = {
    dailyCap: row.dailyCap,
    hourlyCap: row.hourlyCap,
    sliceSize: row.sliceSize,
    warmupEnabled: row.warmupEnabled,
    warmupStartedAt: row.warmupStartedAt,
    whatsappNumber: row.whatsappNumber,
    fromName: row.fromName,
    signerName: row.signerName,
    signerTitle: row.signerTitle,
    htmlEnabled: row.htmlEnabled,
    logoUrl: row.logoUrl,
    sendingEnabled: row.sendingEnabled,
  }
  cached = { at: Date.now(), value }
  return value
}

export async function updateOutreachSettings(
  patch: Partial<OutreachSettings>,
  updatedBy: string
): Promise<OutreachSettings> {
  await db.outreachSettings.upsert({
    where: { id: "default" },
    create: { id: "default", ...patch, updatedBy },
    update: { ...patch, updatedBy },
  })
  invalidateOutreachSettings()
  return getOutreachSettings()
}
