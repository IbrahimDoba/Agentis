import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { getWorkspaceContext } from "@/lib/workspace"
import { checkApiRateLimit } from "@/lib/apiRateLimit"
import { proposeEdits, RETRY_MODEL } from "@/lib/promptEditor"
import { verifyAndApplyEdits, hashValue } from "@/lib/promptEdit"
import { buildDiffHunks } from "@/lib/textDiff"

// Propose an edit to the agent's system prompt from a plain-English instruction.
// Read-only: nothing is written here. The operator reviews the diff and posts
// the ops back to ../apply, which re-verifies them against the live document.

interface Params { params: Promise<{ id: string }> }

const bodySchema = z.object({
  instruction: z.string().trim().min(3).max(2000),
})

// Anchor failures are worth one retry on a stronger model: reproducing a span
// verbatim is exactly where the cheap model slips, and accuracy is the feature.
const RETRYABLE = new Set(["ANCHOR_NOT_FOUND", "ANCHOR_AMBIGUOUS", "ANCHOR_UNSAFE"])

export async function POST(req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { id: agentId } = await params

  const parsed = bodySchema.safeParse(await req.json())
  if (!parsed.success) {
    return NextResponse.json({ errors: parsed.error.flatten().fieldErrors }, { status: 400 })
  }
  const { instruction } = parsed.data

  const { ownerId } = await getWorkspaceContext(session.user.id)
  const agent = await db.agent.findFirst({
    where: { id: agentId, userId: ownerId },
    select: { id: true, responseGuidelines: true },
  })
  if (!agent) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const limit = await checkApiRateLimit(`promptedit:${session.user.id}`, 10, 60)
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Too many edits. Try again in a moment.", retryAfterSec: limit.retryAfterSec },
      { status: 429 }
    )
  }

  const doc = agent.responseGuidelines ?? ""
  if (!doc.trim()) {
    return NextResponse.json(
      { status: "not_found", reason: "This agent has no system prompt yet. Write one first.", ops: [], hunks: [] },
      { status: 200 }
    )
  }

  try {
    const first = await proposeEdits({ doc, instruction })
    const selection = first.selection
    let proposal = first.proposal

    if (selection.tooLarge) {
      return NextResponse.json({
        status: "refused",
        reason: "This prompt is too large to search reliably. Please edit that section manually.",
        ops: [],
        hunks: [],
      })
    }

    if (proposal.status !== "ok" || proposal.edits.length === 0) {
      return NextResponse.json({
        status: proposal.status === "ok" ? "not_found" : proposal.status,
        reason: proposal.reason,
        ops: [],
        hunks: [],
        sectioned: selection.sectioned,
        searchedRegions: selection.selectedRegions,
        totalRegions: selection.totalRegions,
      })
    }

    let verified = verifyAndApplyEdits(doc, proposal.edits)

    if (!verified.ok && RETRYABLE.has(verified.code)) {
      const retry = await proposeEdits({
        doc,
        instruction,
        failureFeedback: verified.message,
        model: RETRY_MODEL,
      })
      if (retry.proposal.status === "ok" && retry.proposal.edits.length > 0) {
        const retryVerified = verifyAndApplyEdits(doc, retry.proposal.edits)
        if (retryVerified.ok) {
          verified = retryVerified
          proposal = retry.proposal
        }
      }
    }

    if (!verified.ok) {
      return NextResponse.json({
        status: "not_found",
        reason: verified.message,
        code: verified.code,
        occurrences: verified.occurrences?.map((o) => o.context) ?? [],
        ops: [],
        hunks: [],
      })
    }

    return NextResponse.json({
      status: "ok",
      reason: proposal.reason,
      // Echoed back to /apply, which re-verifies them — never trusted as-is.
      ops: proposal.edits,
      hunks: buildDiffHunks(doc, verified.spans),
      beforeHash: hashValue(doc),
      model: proposal.model,
      promptTokens: proposal.promptTokens,
      outputTokens: proposal.outputTokens,
      sectioned: selection.sectioned,
      searchedRegions: selection.selectedRegions,
      totalRegions: selection.totalRegions,
    })
  } catch (err) {
    console.error("[POST /api/agents/:id/prompt-edit/propose]", err)
    return NextResponse.json({ error: "Could not draft that edit. Please try again." }, { status: 502 })
  }
}
