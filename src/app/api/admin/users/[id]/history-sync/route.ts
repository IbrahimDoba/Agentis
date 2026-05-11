import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"

interface Params {
  params: Promise<{ id: string }>
}

// GET — read the current value of the admin-controlled history-sync feature
// for this user.
export async function GET(_req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id } = await params
  const user = await db.user.findUnique({
    where: { id },
    select: { id: true, email: true, historySyncEnabled: true },
  })
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 })

  return NextResponse.json(user)
}

// PATCH — toggle (or set) the history-sync feature for this user. Body:
//   { "enabled": true | false }
// When flipped on, the feature only takes effect on the NEXT new BaileysSession
// connect for this user's agents — existing connected sessions won't retro-pull
// history. Flipping back off doesn't delete already-imported chats.
export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id } = await params
  const body = (await req.json().catch(() => ({}))) as { enabled?: unknown }
  if (typeof body.enabled !== "boolean") {
    return NextResponse.json(
      { error: "Body must include { enabled: boolean }" },
      { status: 400 }
    )
  }

  const updated = await db.user
    .update({
      where: { id },
      data: { historySyncEnabled: body.enabled },
      select: { id: true, email: true, historySyncEnabled: true },
    })
    .catch(() => null)

  if (!updated) return NextResponse.json({ error: "User not found" }, { status: 404 })

  return NextResponse.json(updated)
}
