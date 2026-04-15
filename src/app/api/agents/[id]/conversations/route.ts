import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { getConversations, getConversation } from "@/lib/elevenlabs"

interface Params {
  params: Promise<{ id: string }>
}

const PAGE_SIZE = 20

// Normalize any phone-like string to just digits
function normalizePhone(raw: string): string | null {
  const jidMatch = raw.match(/^(\d+)[:@]/)
  const cleaned = jidMatch ? jidMatch[1] : raw.replace(/\D/g, "")
  return cleaned.length >= 7 ? cleaned : null
}

/**
 * Sync recent conversations from ElevenLabs into the local DB.
 * Only runs on first-page requests (no cursor) to keep things fast.
 * Upserts metadata only — transcripts are fetched on-demand via the detail route.
 */
async function syncFromElevenLabs(elevenlabsAgentId: string, dbAgentId: string) {
  try {
    const data = await getConversations(elevenlabsAgentId)
    const convs: any[] = data?.conversations ?? []
    if (!convs.length) return

    // Get the IDs we already have so we only upsert new ones
    const ids = convs.map((c: any) => c.conversation_id).filter(Boolean)
    const existing = await db.conversationLog.findMany({
      where: { conversationId: { in: ids } },
      select: { conversationId: true, status: true, phoneNumber: true },
    })
    const existingIds = new Set(existing.map((e) => e.conversationId))

    const newConvs = convs.filter((c: any) => !existingIds.has(c.conversation_id))

    // Update status for in-progress conversations that have since completed
    const inProgressIds = new Set(
      existing
        .filter((e: any) => e.status === "in-progress" || e.status === "initiated")
        .map((e: any) => e.conversationId)
    )
    const staleConvs = convs.filter(
      (c: any) => inProgressIds.has(c.conversation_id) && c.status === "done"
    )

    // Patch phoneNumber for existing conversations that are missing it
    const missingPhoneIds = new Set(
      existing.filter((e: any) => !e.phoneNumber).map((e: any) => e.conversationId)
    )

    // 1. Patch from list-level user_id where available
    const phonePatches = convs.filter(
      (c: any) => missingPhoneIds.has(c.conversation_id) && c.user_id
    )
    if (phonePatches.length) {
      await Promise.all(
        phonePatches.map((c: any) => {
          const phone = normalizePhone(c.user_id)
          if (!phone) return null
          return db.conversationLog.update({
            where: { conversationId: c.conversation_id },
            data: { phoneNumber: phone },
          })
        })
      )
    }

    // 2. For in-progress conversations still missing a phone (user_id not in list yet),
    //    fetch the detail from ElevenLabs — it reliably has user_id even mid-call.
    //    There are typically 0–2 active calls, so this is cheap.
    const stillMissing = convs.filter(
      (c: any) =>
        missingPhoneIds.has(c.conversation_id) &&
        !c.user_id &&
        (c.status === "in-progress" || c.status === "initiated")
    )
    if (stillMissing.length) {
      await Promise.all(
        stillMissing.map(async (c: any) => {
          try {
            const detail = await getConversation(c.conversation_id)
            if (!detail?.user_id) return
            const phone = normalizePhone(detail.user_id as string)
            if (!phone) return
            await db.conversationLog.update({
              where: { conversationId: c.conversation_id },
              data: { phoneNumber: phone },
            })
          } catch { /* non-fatal */ }
        })
      )
    }

    const toUpsert = [...newConvs, ...staleConvs]
    if (!toUpsert.length) return

    await Promise.all(
      toUpsert.map((c: any) => {
        const metadata = c.metadata as Record<string, any> | undefined
        const phoneRaw =
          (c.user_id as string | undefined) ??
          (metadata?.from_number as string | undefined) ??
          (metadata?.caller_id as string | undefined)
        const phoneNumber = phoneRaw ? normalizePhone(phoneRaw) : null

        const callTime = c.start_time_unix_secs ? new Date(c.start_time_unix_secs * 1000) : undefined

        return db.conversationLog.upsert({
          where: { conversationId: c.conversation_id },
          create: {
            conversationId: c.conversation_id,
            elevenlabsAgentId,
            agentId: dbAgentId,
            phoneNumber,
            transcript: [],
            summary: c.transcript_summary ?? null,
            durationSecs: c.call_duration_secs ?? null,
            startTime: callTime ?? null,
            // Use actual call time for createdAt so DB ordering reflects real call time,
            // not the time the sync ran.
            ...(callTime ? { createdAt: callTime } : {}),
            status: c.status ?? null,
            rawPayload: c,
          },
          update: {
            summary: c.transcript_summary ?? undefined,
            durationSecs: c.call_duration_secs ?? undefined,
            status: c.status ?? undefined,
            rawPayload: c,
          },
        })
      })
    )

    console.log(`[sync] ✅ Synced ${newConvs.length} new, ${staleConvs.length} status-updated conversations`)
  } catch (err) {
    // Non-fatal — fall through to DB query
    console.error("[sync] ElevenLabs sync failed:", err)
  }
}

export async function GET(req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  const agent = await db.agent.findUnique({
    where: { id },
    select: { userId: true, elevenlabsAgentId: true },
  })

  if (!agent) return NextResponse.json({ error: "Agent not found" }, { status: 404 })

  const isOwner = agent.userId === session.user.id
  const isAdmin = session.user.role === "ADMIN"
  if (!isOwner && !isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  if (!agent.elevenlabsAgentId) {
    return NextResponse.json({ conversations: [], has_more: false, next_cursor: null })
  }

  const cursor = req.nextUrl.searchParams.get("cursor")
  const phone = req.nextUrl.searchParams.get("phone")

  // On first page, sync latest from ElevenLabs before returning DB results
  // Skip sync when filtering by phone (used by contacts thread view)
  if (!cursor && !phone) {
    await syncFromElevenLabs(agent.elevenlabsAgentId, id)
  }

  const agentFilter = {
    OR: [
      { agentId: id },
      { elevenlabsAgentId: agent.elevenlabsAgentId },
    ],
  }

  const logs = await db.conversationLog.findMany({
    where: phone
      ? { ...agentFilter, phoneNumber: phone }
      : agentFilter,
    orderBy: [
      { startTime: { sort: "desc", nulls: "last" } },
      { createdAt: "desc" },
    ],
    // When filtering by phone (contact thread view), fetch all sessions (cap at 200).
    // For the main list, use PAGE_SIZE pagination.
    take: phone ? 200 : PAGE_SIZE + 1,
    ...(cursor ? { cursor: { conversationId: cursor }, skip: 1 } : {}),
    select: {
      conversationId: true,
      phoneNumber: true,
      transcript: true,
      summary: true,
      durationSecs: true,
      startTime: true,
      createdAt: true,
      status: true,
      creditsUsed: true,
      rawPayload: true,
    },
  })

  const hasMore = logs.length > PAGE_SIZE
  const page = hasMore ? logs.slice(0, PAGE_SIZE) : logs
  const nextCursor = hasMore ? page[page.length - 1].conversationId : null

  const conversations = page.map((log) => {
    const raw = log.rawPayload as Record<string, any> | null
    const analysis = raw?.analysis as Record<string, any> | undefined
    const transcript = Array.isArray(log.transcript) ? log.transcript : []

    return {
      conversation_id: log.conversationId,
      start_time_unix_secs: log.startTime
        ? Math.floor(log.startTime.getTime() / 1000)
        : Math.floor(log.createdAt.getTime() / 1000),
      call_duration_secs: log.durationSecs ?? 0,
      message_count: transcript.length,
      transcript_summary: log.summary ?? analysis?.transcript_summary ?? null,
      call_summary_title: raw?.call_summary_title ?? analysis?.call_summary_title ?? null,
      call_successful: analysis?.call_successful ?? raw?.call_successful ?? null,
      status: log.status ?? "done",
      // Prefer normalized phoneNumber; fall back to raw ElevenLabs user_id (may be WhatsApp JID)
      user_id: log.phoneNumber ?? raw?.user_id ?? null,
      // Pass through metadata so getCallerIdentifier can check fallback phone fields
      metadata: raw?.metadata ?? null,
      creditsUsed: log.creditsUsed || (raw?.metadata as any)?.cost || (raw?.analysis as any)?.credits_used || 0,
    }
  })

  return NextResponse.json({ conversations, has_more: hasMore, next_cursor: nextCursor })
}
