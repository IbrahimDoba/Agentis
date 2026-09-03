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

// The events the worker emits. Mirrors WorkerEvent in
// worker/src/dashboard/webhook-emitter.ts — the packages cannot import each
// other, so this is the only place the contract is stated on this side.
// Typing it (it used to be `string`) is what makes a missing case visible.
type WorkerEvent =
  | "session.qr"
  | "session.connected"
  | "session.disconnected"
  | "session.banned"
  | "message.inbound"
  | "message.sent"
  | "message.failed"

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

  const { event, data } = JSON.parse(raw) as { event: WorkerEvent; data: Record<string, unknown> }
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

    // A send that failed still changes what the dashboard should show, exactly
    // like one that succeeded. This case was missing, so failures were emitted
    // by the worker and dropped here in silence.
    case "message.failed":
      push(agentId, "message", { agentId })
      break

    // Deliberately nothing to do. The worker writes QR_PENDING to
    // BaileysSession itself (session-manager.ts), and the browser reads the QR
    // straight from the worker through the SSE proxy at
    // /api/baileys/sessions/[agentId]/qr — so a DB write here would duplicate
    // one the worker already throttles. Listed so "handled, nothing to do" is
    // distinguishable from "forgotten", which is what went wrong here.
    case "session.qr":
      break

    default: {
      // Compile time: if WorkerEvent gains a member and no case handles it,
      // this assignment stops being valid and typecheck fails. That is the
      // guard that was missing — session.qr and message.failed were emitted
      // and dropped with nothing to notice it.
      // Run time: an unknown event is still acknowledged, never rejected. The
      // worker can ship a new event before this app deploys, and a 200 keeps
      // its emitter from retrying against a version that cannot handle it yet.
      const unhandled: never = event
      void unhandled
      break
    }
  }

  return NextResponse.json({ ok: true })
}
