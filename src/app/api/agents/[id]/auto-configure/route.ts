import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { generateAutoConfigDraft, parseJsonbColumn } from "@/lib/agent-auto-config"
import { baileysClient } from "@/lib/baileys-client"

interface Params {
  params: Promise<{ id: string }>
}

async function isAutoConfigSkipped(agentId: string): Promise<boolean> {
  const agent = await db.agent.findUnique({
    where: { id: agentId },
    select: { autoConfigStatus: true },
  })

  return agent?.autoConfigStatus === "skipped"
}

// GET — return the current auto-configure status + draft (if ready).
// The onboarding/configuring page polls this; the onboarding/review page
// reads it once to render the editable form.
export async function GET(_req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { id } = await params

  const agent = await db.agent.findFirst({
    where: { id, userId: session.user.id },
    select: {
      id: true,
      autoConfigStatus: true,
      autoConfigStartedAt: true,
      autoConfigCompletedAt: true,
      autoConfigDraft: true,
      autoConfigInputs: true,
    },
  })
  if (!agent) return NextResponse.json({ error: "Agent not found" }, { status: 404 })

  // Don't ship the full input dataset back to the browser — it's the entire
  // analyzed chat history and ~50–100KB on the wire. Just return a count.
  const inputs = parseJsonbColumn<{ candidates?: unknown[] }>(agent.autoConfigInputs)
  const candidateCount = Array.isArray(inputs?.candidates) ? inputs.candidates.length : 0

  return NextResponse.json({
    status: agent.autoConfigStatus ?? "pending",
    startedAt: agent.autoConfigStartedAt?.toISOString() ?? null,
    completedAt: agent.autoConfigCompletedAt?.toISOString() ?? null,
    candidateCount,
    draft: parseJsonbColumn(agent.autoConfigDraft),
  })
}

// POST — kick off (or re-run) the LLM analysis step. Chat extraction is
// triggered automatically by the worker after history-sync; this endpoint
// is what /onboarding/configuring calls when extraction is done and we
// want the LLM to produce the draft. Also used by the A5 "regenerate"
// button on the Profile tab.
export async function POST(_req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { id } = await params

  const agent = await db.agent.findFirst({
    where: { id, userId: session.user.id },
    select: { id: true, autoConfigStatus: true, autoConfigInputs: true },
  })
  if (!agent) return NextResponse.json({ error: "Agent not found" }, { status: 404 })

  // Clear stale failure state up front so the page immediately shows
  // "configuring" instead of flashing the old failure view between polls.
  // We use raw SQL because Prisma's `undefined` doesn't actually null Json.
  await db.$executeRawUnsafe(
    `UPDATE "Agent" SET "autoConfigStatus" = 'analyzing', "autoConfigDraft" = NULL WHERE "id" = $1`,
    id
  )

  // Fire-and-forget — re-extract from DB first (in case more chats have
  // landed since the last extractor pass), then run the LLM. The page
  // polls GET above to track progress.
  ;(async () => {
    const setFailed = async (message: string) => {
      if (await isAutoConfigSkipped(id)) return
      console.warn("[auto-configure]", message)
      await db.$executeRawUnsafe(
        `UPDATE "Agent" SET "autoConfigStatus" = 'failed', "autoConfigDraft" = jsonb_build_object('error', $1::text) WHERE "id" = $2`,
        message,
        id
      ).catch(() => {})
    }

    try {
      // 1. Re-extract chats from the DB. Idempotent; updates
      //    autoConfigInputs + autoConfigStatus. The worker reads from the
      //    Conversation/Message tables — we MUST have called the worker
      //    here, otherwise we'd be working off stale inputs (or none at all).
      let extract
      try {
        extract = await baileysClient.extractChatsForAgent(id)
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        await setFailed(`Couldn't reach the worker to extract chats: ${msg}. Make sure the worker is running.`)
        return
      }

      if (extract.status !== "ready" || extract.candidateCount === 0) {
        await setFailed(
          `Couldn't find usable customer chats to analyze yet (${extract.candidateCount} qualifying chat${extract.candidateCount === 1 ? "" : "s"}). Try again after more conversations come in, or set up the agent manually.`
        )
        return
      }

      // 2. Re-read after extract; defensive double-check.
      const fresh = await db.agent.findUnique({
        where: { id },
        select: { autoConfigInputs: true },
      })
      const inputs = parseJsonbColumn<{ candidates?: unknown[] }>(fresh?.autoConfigInputs)
      if (!inputs || !Array.isArray(inputs.candidates) || inputs.candidates.length === 0) {
        await setFailed(
          `Extract reported ${extract.candidateCount} candidates but DB read returned ${Array.isArray(inputs?.candidates) ? inputs!.candidates!.length : "no"} — possible JSON parsing issue.`
        )
        return
      }

      // 3. Run the LLM on the fresh inputs.
      if (await isAutoConfigSkipped(id)) return
      await generateAutoConfigDraft(id)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      await setFailed(message)
    }
  })()

  return NextResponse.json({ ok: true, status: "analyzing" })
}
