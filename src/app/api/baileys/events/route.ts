import { NextResponse } from "next/server"
import { createHmac, timingSafeEqual } from "crypto"
import { db } from "@/lib/db"

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
      // Stored by the worker directly in the DB — nothing extra needed here yet.
      // This hook is available for real-time push notifications in the future.
      break
  }

  return NextResponse.json({ ok: true })
}
