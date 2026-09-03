import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { exchangeCodeForToken, getNumberDetails, saveConnection } from "@/lib/meta/embedded-signup"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// GET — connections already stored, for the UI list. Tokens are never returned.
export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const connections = await db.metaConnection.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      wabaId: true,
      phoneNumberId: true,
      displayPhoneNumber: true,
      verifiedName: true,
      registeredAt: true,
      subscribedAt: true,
      createdAt: true,
      agent: { select: { businessName: true } },
    },
  })

  const agents = await db.agent.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "asc" },
    select: { id: true, businessName: true },
  })

  return NextResponse.json({
    agents,
    connections: connections.map((c) => ({
      ...c,
      agentName: c.agent?.businessName ?? null,
      registeredAt: c.registeredAt?.toISOString() ?? null,
      subscribedAt: c.subscribedAt?.toISOString() ?? null,
      createdAt: c.createdAt.toISOString(),
    })),
  })
}

// POST — completes Embedded Signup: exchange the popup's code for a business
// token, read the number's details, and store the connection. Deliberately does
// NOT register or subscribe the number; that's a separate confirmed step.
export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await req.json().catch(() => null)
  const code = typeof body?.code === "string" ? body.code : ""
  const wabaId = typeof body?.wabaId === "string" ? body.wabaId : ""
  const phoneNumberId = typeof body?.phoneNumberId === "string" ? body.phoneNumberId : ""

  if (!code || !wabaId || !phoneNumberId) {
    return NextResponse.json(
      { error: "code, wabaId and phoneNumberId are required" },
      { status: 400 }
    )
  }

  console.log(`[meta/connect] exchange requested — waba=${wabaId} phone=${phoneNumberId}`)

  try {
    const accessToken = await exchangeCodeForToken(code)
    const details = await getNumberDetails(phoneNumberId, accessToken)

    // Which agent answers on this number. The caller may name one; otherwise
    // default to the account's first agent so a connection is usable straight
    // away rather than silently answering nobody.
    const requestedAgentId = typeof body?.agentId === "string" ? body.agentId : null
    const agent = await db.agent.findFirst({
      where: { userId: session.user.id, ...(requestedAgentId ? { id: requestedAgentId } : {}) },
      orderBy: requestedAgentId ? undefined : { createdAt: "asc" },
      select: { id: true },
    })

    const saved = await saveConnection({
      wabaId,
      phoneNumberId,
      businessId: typeof body?.businessId === "string" ? body.businessId : null,
      accessToken,
      details,
      userId: session.user.id,
      agentId: agent?.id ?? null,
    })

    console.log(
      `[meta/connect] stored connection for ${saved.displayPhoneNumber ?? saved.phoneNumberId} ` +
        `agent=${saved.agentId ?? "NONE — no agent on this account, it cannot reply yet"}`
    )
    return NextResponse.json({
      connection: {
        id: saved.id,
        wabaId: saved.wabaId,
        phoneNumberId: saved.phoneNumberId,
        displayPhoneNumber: saved.displayPhoneNumber,
        verifiedName: saved.verifiedName,
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Connect failed"
    console.error("[meta/connect] failed:", message)
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
