import { withAdmin } from "@/lib/api/withAuth"
import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"

interface Params {
  params: Promise<{ id: string }>
}

const SECTIONS = ["status", "whatsapp", "activity", "team"] as const
type Section = (typeof SECTIONS)[number]

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000

// One route, one section per request: each user-detail tab loads only what it
// shows, so opening the modal doesn't fan out into every table.
export const GET = withAdmin(async (req: NextRequest, { params }: Params) => {
  const { id } = await params
  const section = req.nextUrl.searchParams.get("section") as Section | null
  if (!section || !SECTIONS.includes(section)) {
    return NextResponse.json({ error: `section must be one of ${SECTIONS.join(", ")}` }, { status: 400 })
  }

  try {
    const user = await db.user.findUnique({ where: { id }, select: { id: true } })
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 })

    const agents = await db.agent.findMany({
      where: { userId: id },
      select: { id: true, businessName: true },
    })
    const agentIds = agents.map((a) => a.id)

    if (section === "status") return NextResponse.json(await statusInsights(agentIds))
    if (section === "whatsapp") return NextResponse.json(await whatsappInsights(id))
    if (section === "activity") return NextResponse.json(await activityInsights(id, agentIds))
    return NextResponse.json(await teamInsights(id))
  } catch (err) {
    console.error(`[admin/users/insights] ${section} failed for ${id}:`, err)
    return NextResponse.json({ error: "Failed to load" }, { status: 500 })
  }
})

async function statusInsights(agentIds: string[]) {
  const since = new Date(Date.now() - THIRTY_DAYS_MS)
  const scope = { agentId: { in: agentIds } }

  const [byStatus, posted30d, funnel, contacts, savedByUs, galleryCount, latestRun, recent] = await Promise.all([
    db.statusPost.groupBy({ by: ["status"], where: scope, _count: { _all: true }, _sum: { creditsUsed: true } }),
    db.statusPost.aggregate({
      where: { ...scope, status: "posted", postedAt: { gte: since } },
      _count: { _all: true },
      _sum: { recipientCount: true },
    }),
    db.statusView.aggregate({
      where: { ...scope, post: { postedAt: { gte: since } } },
      _count: { deliveredAt: true, viewedAt: true, likedAt: true, repliedAt: true },
    }),
    db.whatsAppContact.count({ where: scope }),
    db.whatsAppContact.count({ where: { ...scope, savedBy: "dailzero" } }),
    db.statusGalleryItem.count({ where: { ...scope, hiddenAt: null } }),
    db.contactSaveRun.findFirst({
      where: scope,
      orderBy: { createdAt: "desc" },
      select: { status: true, pauseReason: true, totalCount: true, savedCount: true, failedCount: true, creditsUsed: true, createdAt: true, completedAt: true },
    }),
    db.statusPost.findMany({
      where: scope,
      orderBy: { scheduledAt: "desc" },
      take: 10,
      select: { id: true, kind: true, text: true, status: true, scheduledAt: true, postedAt: true, recipientCount: true, creditsUsed: true, error: true },
    }),
  ])

  const viewCounts = recent.length
    ? await db.statusView.groupBy({
        by: ["postId"],
        where: { postId: { in: recent.map((p) => p.id) }, viewedAt: { not: null } },
        _count: { _all: true },
      })
    : []
  const viewsByPost = new Map(viewCounts.map((v) => [v.postId, v._count._all]))

  return {
    byStatus: byStatus.map((g) => ({ status: g.status, count: g._count._all })),
    creditsUsed: byStatus.reduce((sum, g) => sum + (g._sum.creditsUsed ?? 0), 0),
    last30d: {
      posts: posted30d._count._all,
      reach: posted30d._sum.recipientCount ?? 0,
      delivered: funnel._count.deliveredAt,
      viewed: funnel._count.viewedAt,
      liked: funnel._count.likedAt,
      replied: funnel._count.repliedAt,
    },
    contacts,
    savedByUs,
    galleryCount,
    latestRun: latestRun && {
      ...latestRun,
      createdAt: latestRun.createdAt.toISOString(),
      completedAt: latestRun.completedAt?.toISOString() ?? null,
    },
    recent: recent.map((p) => ({
      ...p,
      text: p.text ? p.text.slice(0, 120) : null,
      scheduledAt: p.scheduledAt.toISOString(),
      postedAt: p.postedAt?.toISOString() ?? null,
      views: viewsByPost.get(p.id) ?? 0,
    })),
  }
}

async function whatsappInsights(userId: string) {
  const [agents, meta] = await Promise.all([
    db.agent.findMany({
      where: { userId },
      select: {
        id: true,
        businessName: true,
        transportType: true,
        baileysSession: {
          select: { phoneNumber: true, status: true, lastConnectedAt: true, lastDisconnectReason: true, warmupTier: true, dailyMessageCount: true },
        },
      },
    }),
    db.metaConnection.findMany({
      where: { userId },
      select: {
        id: true,
        displayPhoneNumber: true,
        verifiedName: true,
        registeredAt: true,
        subscribedAt: true,
        aiRepliesEnabled: true,
        agent: { select: { businessName: true } },
      },
    }),
  ])

  return {
    sessions: agents.map((a) => ({
      agentId: a.id,
      businessName: a.businessName,
      transportType: a.transportType,
      session: a.baileysSession && {
        ...a.baileysSession,
        lastConnectedAt: a.baileysSession.lastConnectedAt?.toISOString() ?? null,
      },
    })),
    metaNumbers: meta.map((m) => ({
      id: m.id,
      displayPhoneNumber: m.displayPhoneNumber,
      verifiedName: m.verifiedName,
      registered: Boolean(m.registeredAt),
      subscribed: Boolean(m.subscribedAt),
      aiRepliesEnabled: m.aiRepliesEnabled,
      agentName: m.agent?.businessName ?? null,
    })),
  }
}

async function activityInsights(userId: string, agentIds: string[]) {
  const since = new Date(Date.now() - THIRTY_DAYS_MS)
  const now = new Date()
  const scope = { agentId: { in: agentIds } }

  const [conversations, active30d, humanMode, summaries, lastActive, leads, leads30d, appointmentsByStatus, upcoming, broadcasts, apiKeys] = await Promise.all([
    db.conversation.count({ where: scope }),
    db.conversation.count({ where: { ...scope, lastActivityAt: { gte: since } } }),
    db.conversation.count({ where: { ...scope, mode: "human" } }),
    db.conversationSummary.count({ where: { conversation: scope } }),
    db.conversation.findFirst({ where: scope, orderBy: { lastActivityAt: "desc" }, select: { lastActivityAt: true } }),
    db.lead.count({ where: { userId } }),
    db.lead.count({ where: { userId, createdAt: { gte: since } } }),
    db.appointment.groupBy({ by: ["status"], where: { userId }, _count: { _all: true } }),
    db.appointment.count({ where: { userId, status: "SCHEDULED", scheduledAt: { gte: now } } }),
    db.broadcastCampaign.findMany({
      where: scope,
      orderBy: { createdAt: "desc" },
      take: 5,
      select: { id: true, message: true, status: true, channel: true, totalCount: true, sentCount: true, failedCount: true, createdAt: true },
    }),
    db.apiKey.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      select: { id: true, name: true, prefix: true, status: true, scopes: true, lastUsedAt: true, dailySpentCredits: true },
    }),
  ])

  return {
    conversations: {
      total: conversations,
      active30d,
      humanMode,
      withMemory: summaries,
      lastActiveAt: lastActive?.lastActivityAt?.toISOString() ?? null,
    },
    leads: { total: leads, last30d: leads30d },
    appointments: {
      byStatus: appointmentsByStatus.map((g) => ({ status: g.status, count: g._count._all })),
      upcoming,
    },
    broadcasts: broadcasts.map((b) => ({ ...b, message: b.message.slice(0, 100), createdAt: b.createdAt.toISOString() })),
    apiKeys: apiKeys.map((k) => ({ ...k, lastUsedAt: k.lastUsedAt?.toISOString() ?? null })),
  }
}

async function teamInsights(userId: string) {
  const members = await db.workspaceMember.findMany({
    where: { workspaceId: userId },
    orderBy: { invitedAt: "desc" },
    select: { id: true, email: true, role: true, status: true, invitedAt: true, joinedAt: true, user: { select: { name: true } } },
  })
  return {
    members: members.map((m) => ({
      id: m.id,
      email: m.email,
      name: m.user?.name ?? null,
      role: m.role,
      status: m.status,
      invitedAt: m.invitedAt.toISOString(),
      joinedAt: m.joinedAt?.toISOString() ?? null,
    })),
  }
}
