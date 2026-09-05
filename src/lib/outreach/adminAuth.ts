import { timingSafeEqual } from "node:crypto"
import type { NextRequest } from "next/server"
import { auth } from "@/lib/auth"

// Authorisation for the outreach admin routes: an admin session, or a bearer
// token scoped to these routes alone.
//
// The token exists because loading a batch of drafts is a scripted job, and
// scripts do not have browser sessions. Same shape as the CRON_SECRET guard on
// src/app/api/cron/notifications/route.ts, and deliberately narrow: it opens the
// four outreach endpoints and nothing else, so a leak cannot reach users,
// billing or agents. Unset means session-only, which is the safe default for
// any deployment that never needs it.

export type OutreachActor = { kind: "session"; email: string } | { kind: "token" }

function tokenMatches(provided: string): boolean {
  const expected = process.env.OUTREACH_ADMIN_TOKEN
  // A short or absent token must never be a way in. Length is compared first
  // because timingSafeEqual throws on mismatched buffers rather than returning
  // false, and a thrown error here would read as a server fault, not a refusal.
  if (!expected || expected.length < 24) return false
  const a = Buffer.from(provided)
  const b = Buffer.from(expected)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

/**
 * Returns the actor when the request is allowed, or null when it is not.
 * Callers reply 401 on null rather than distinguishing the two failure modes,
 * so a wrong token learns nothing a missing one would not.
 */
export async function authorizeOutreachAdmin(req: NextRequest): Promise<OutreachActor | null> {
  const header = req.headers.get("authorization") ?? ""
  if (header.startsWith("Bearer ")) {
    return tokenMatches(header.slice(7)) ? { kind: "token" } : null
  }

  const session = await auth()
  if (!session || session.user.role !== "ADMIN") return null
  return { kind: "session", email: session.user.email ?? "admin" }
}

/** Who to record as having made a change. */
export function actorLabel(actor: OutreachActor): string {
  return actor.kind === "token" ? "api-token" : actor.email
}
