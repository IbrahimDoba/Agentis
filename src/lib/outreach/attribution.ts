import { db } from "@/lib/db"

// Machine-captured first touch, read from the dz_attr cookie that /r/<token>
// sets. Kept out of the signup route so that route keeps reading as an auth
// flow, and so this can never throw into it.

const COOKIE = "dz_attr"

type AttrCookie = { t?: string; p?: string; s?: string; m?: string; c?: string }

function parse(raw: string | undefined): AttrCookie | null {
  if (!raw) return null
  try {
    const value = JSON.parse(raw) as AttrCookie
    return typeof value === "object" && value !== null ? value : null
  } catch {
    return null
  }
}

/**
 * Records where a new signup came from. Every call site treats this as
 * fire-and-forget: attribution is reporting, and it must never be able to fail
 * a signup that has already created the user.
 */
export async function recordSignupAttribution(args: {
  userId: string
  cookieValue: string | undefined
  landingPath?: string | null
  utm?: { source?: string | null; medium?: string | null; campaign?: string | null }
}): Promise<void> {
  const cookie = parse(args.cookieValue)
  const source = cookie?.s ?? args.utm?.source ?? null
  const medium = cookie?.m ?? args.utm?.medium ?? null
  const campaign = cookie?.c ?? args.utm?.campaign ?? null

  // Nothing to record beats an empty row per signup.
  if (!source && !medium && !campaign && !cookie?.p) return

  await db.signupAttribution.upsert({
    where: { userId: args.userId },
    create: {
      userId: args.userId,
      prospectId: cookie?.p ?? null,
      clickToken: cookie?.t ?? null,
      source,
      medium,
      campaign,
      landingPath: args.landingPath ?? null,
    },
    update: {},
  })

  if (cookie?.p) {
    // updateMany so a stale cookie pointing at an erased prospect is a no-op
    // rather than a throw inside a fire-and-forget path.
    await db.outreachProspect.updateMany({
      where: { id: cookie.p },
      data: { status: "converted", convertedUserId: args.userId },
    })
  }
}

export const ATTRIBUTION_COOKIE = COOKIE
