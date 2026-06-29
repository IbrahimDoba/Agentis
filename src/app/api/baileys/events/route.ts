import { NextResponse } from "next/server"
import { createHmac, timingSafeEqual } from "crypto"
import { db } from "@/lib/db"
import { push } from "@/lib/sse-store"
import { isTrialPlan, trialDeadlineFrom } from "@/lib/trial"

// Start a platform free user's trial clock the first time they connect WhatsApp.
// Runs once: skipped for reseller/paid users and anyone who already has a
// deadline (so reconnects never reset it).
async function maybeStartFreeTrial(agentId: string): Promise<void> {
  const agent = await db.agent.findUnique({
    where: { id: agentId },
    select: { user: { select: { id: true, plan: true, resellerId: true, subscriptionExpiresAt: true } } },
  })
  const user = agent?.user
  if (!user) return
  if (!isTrialPlan(user.plan, user.resellerId)) return
  if (user.subscriptionExpiresAt) return
  await db.user.update({
    where: { id: user.id },
    data: { subscriptionExpiresAt: trialDeadlineFrom(new Date()) },
  })
}

function verify(body: string, signature: string): boolean {
  const secret = process.env.BAILEYS_WEBHOOK_SECRET ?? ""
  const expected = createHmac("sha256", secret).update(body).digest("hex")
  try {
    return timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
  } catch {
    return false
  }
}

export async function POST(req: Request) {
  const raw = await req.text()
  const sig = req.headers.get("x-baileys-signature") ?? ""

  if (!verify(raw, sig)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 })
  }

  const { event, data } = JSON.parse(raw) as { event: string; data: Record<string, unknown> }
  const agentId = data.agentId as string

  switch (event) {
    case "session.connected":
      await db.baileysSession.updateMany({
        where: { agentId },
        data: {
          status: "CONNECTED",
          phoneNumber: data.phoneNumber as string,
          lastConnectedAt: new Date(),
        },
      })
      await maybeStartFreeTrial(agentId)
      break

    case "session.disconnected":
      await db.baileysSession.updateMany({
        where: { agentId },
        data: {
          status: "DISCONNECTED",
          lastDisconnectReason: data.reason as string,
        },
      })
      break

    case "session.banned":
      await db.baileysSession.updateMany({
        where: { agentId },
        data: { status: "BANNED" },
      })
      break

    case "message.inbound":
      push(agentId, "message", { agentId })
      break

    case "message.sent":
      push(agentId, "message", { agentId })
      break
  }

  return NextResponse.json({ ok: true })
}
