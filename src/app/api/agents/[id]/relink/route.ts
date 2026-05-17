import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { baileysClient } from "@/lib/baileys-client"

interface Params {
  params: Promise<{ id: string }>
}

// Destructive re-link: tells the worker to log out the current WhatsApp
// session, purges all auth state (local + Supabase backup + BaileysSession
// DB row), and resets the agent's auto-configure state so the next QR
// scan triggers a fresh history pull + analysis.
//
// Required when:
//  - First history pull crashed and we need to retry from scratch
//  - User wants to refresh the agent based on a different / re-imported WhatsApp account
//  - Profile/business changed and they want to re-sync everything
//
// After this returns, the client should redirect to
// /dashboard/channels/whatsapp-web?onboarding=1&agentId=X so the user can
// re-scan a fresh QR. The onboarding=1 flag drives the auto-bounce to
// /onboarding/auto-configure on successful connection.
export async function POST(_req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { id } = await params

  const agent = await db.agent.findFirst({
    where: { id, userId: session.user.id },
    select: { id: true },
  })
  if (!agent) return NextResponse.json({ error: "Agent not found" }, { status: 404 })

  // 1. Tell the worker to destroy the session — logs out from WhatsApp,
  //    purges auth files locally + in Supabase, deletes BaileysSession row.
  try {
    await baileysClient.deleteSession(id)
  } catch (err) {
    // Worker errors are non-fatal here — if the session was never connected
    // or already destroyed, we still want to reset the agent's auto-config
    // state. Log and continue.
    console.warn("[relink] worker destroy failed (continuing):", err)
  }

  // 2. Reset the agent's auto-configure state so the next pair triggers
  //    profile-import + history-sync + chat-extractor afresh.
  // Prisma treats `undefined` as "skip this column" on Json fields, so we
  // use raw SQL to actually null out autoConfigInputs/Draft. Otherwise
  // stale candidates from the previous attempt linger and the retry path
  // tries to run the LLM against {candidates: []} and throws "no candidates".
  await db.$executeRawUnsafe(
    `UPDATE "Agent"
     SET "autoConfigStatus" = NULL,
         "autoConfigInputs" = NULL,
         "autoConfigDraft" = NULL,
         "autoConfigStartedAt" = NULL,
         "autoConfigCompletedAt" = NULL
     WHERE "id" = $1`,
    id
  )

  return NextResponse.json({ ok: true })
}
