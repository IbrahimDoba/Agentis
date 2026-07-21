import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { getWorkspaceContext } from "@/lib/workspace"
import { gatherAnalystFacts } from "@/lib/analyst/healthReport"
import { buildNarrative } from "@/lib/analyst/narrative"
import { cachedJson, invalidate } from "@/lib/cache"

// The AI Analyst report: computed account facts + an LLM narration of them.
// Cached for 6h per owner (the facts queries + one gpt-4o-mini call are cheap
// but not free); ?refresh=1 rebuilds on demand.
const TTL_SECONDS = 6 * 60 * 60

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { ownerId } = await getWorkspaceContext(session.user.id)
  const cacheKey = `analyst:${ownerId}`

  if (req.nextUrl.searchParams.get("refresh") === "1") {
    await invalidate(cacheKey)
  }

  try {
    const report = await cachedJson(cacheKey, TTL_SECONDS, async () => {
      const facts = await gatherAnalystFacts(ownerId)
      if (!facts) return null
      const narrative = await buildNarrative(facts)
      return { facts, narrative }
    })
    if (!report) return NextResponse.json({ error: "Account not found" }, { status: 404 })
    return NextResponse.json(report)
  } catch (error) {
    console.error("[GET /api/analyst]", error)
    return NextResponse.json({ error: "Failed to build the analyst report" }, { status: 500 })
  }
}
