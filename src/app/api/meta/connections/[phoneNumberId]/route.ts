import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

interface Params {
  params: Promise<{ phoneNumberId: string }>
}

// Every write here is scoped by userId as well as phoneNumberId. phoneNumberId
// is globally unique, so a plain lookup would happily hand one account's number
// to another's session — the compound where is the tenant boundary, not a
// belt-and-braces extra.
async function ownedConnection(userId: string, phoneNumberId: string) {
  return db.metaConnection.findFirst({
    where: { phoneNumberId, userId },
    select: { id: true },
  })
}

// PATCH — reassign the answering agent, detach it, or flip a per-number setting.
// One route for all three because they are the same row and the UI saves them
// the same way: a single field at a time, on change.
export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { phoneNumberId } = await params
  const body = await req.json().catch(() => null)
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 })
  }

  const data: {
    agentId?: string | null
    aiRepliesEnabled?: boolean
    typingIndicator?: boolean
  } = {}

  // agentId is tri-state: absent (leave alone), null (detach), or an id. Only
  // `undefined` means "not being changed", so check the key rather than falsiness.
  if ("agentId" in body) {
    const next = body.agentId
    if (next === null) {
      data.agentId = null
    } else if (typeof next === "string" && next.length > 0) {
      // The agent must belong to the same account, or a connection could be
      // pointed at someone else's agent and answer with their business's brain.
      const agent = await db.agent.findFirst({
        where: { id: next, userId: session.user.id },
        select: { id: true },
      })
      if (!agent) return NextResponse.json({ error: "Unknown agent" }, { status: 400 })
      data.agentId = agent.id
    } else {
      return NextResponse.json({ error: "agentId must be an id or null" }, { status: 400 })
    }
  }

  if ("aiRepliesEnabled" in body) {
    if (typeof body.aiRepliesEnabled !== "boolean") {
      return NextResponse.json({ error: "aiRepliesEnabled must be a boolean" }, { status: 400 })
    }
    data.aiRepliesEnabled = body.aiRepliesEnabled
  }

  if ("typingIndicator" in body) {
    if (typeof body.typingIndicator !== "boolean") {
      return NextResponse.json({ error: "typingIndicator must be a boolean" }, { status: 400 })
    }
    data.typingIndicator = body.typingIndicator
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 })
  }

  try {
    const owned = await ownedConnection(session.user.id, phoneNumberId)
    if (!owned) return NextResponse.json({ error: "Not found" }, { status: 404 })

    const updated = await db.metaConnection.update({
      where: { id: owned.id },
      data,
      select: {
        phoneNumberId: true,
        agentId: true,
        aiRepliesEnabled: true,
        typingIndicator: true,
        agent: { select: { businessName: true } },
      },
    })

    return NextResponse.json({
      phoneNumberId: updated.phoneNumberId,
      agentId: updated.agentId,
      agentName: updated.agent?.businessName ?? null,
      aiRepliesEnabled: updated.aiRepliesEnabled,
      typingIndicator: updated.typingIndicator,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Update failed"
    console.error(`[meta/connections] PATCH ${phoneNumberId} failed:`, message)
    return NextResponse.json({ error: "Update failed" }, { status: 500 })
  }
}

// DELETE — forget the connection on our side. Deliberately local-only: it does
// NOT deregister the number at Meta or unsubscribe the app, because both are
// destructive to a phone number the business owns and one of them (register)
// sets a two-step PIN that isn't trivially undone. Inbound to a forgotten number
// stops routing — resolveNumberContext finds no row and the webhook drops it.
export async function DELETE(_req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { phoneNumberId } = await params

  try {
    const owned = await ownedConnection(session.user.id, phoneNumberId)
    if (!owned) return NextResponse.json({ error: "Not found" }, { status: 404 })

    await db.metaConnection.delete({ where: { id: owned.id } })
    console.log(`[meta/connections] deleted connection for ${phoneNumberId}`)
    return NextResponse.json({ ok: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Delete failed"
    console.error(`[meta/connections] DELETE ${phoneNumberId} failed:`, message)
    return NextResponse.json({ error: "Delete failed" }, { status: 500 })
  }
}
