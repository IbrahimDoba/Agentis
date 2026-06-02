import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"

interface Params {
  params: Promise<{ id: string }>
}

export async function POST(_req: Request, { params }: Params) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  const agent = await db.agent.findFirst({
    where: { id, userId: session.user.id },
    select: { id: true },
  })

  if (!agent) return NextResponse.json({ error: "Agent not found" }, { status: 404 })

  await db.agent.update({
    where: { id },
    data: {
      autoConfigStatus: "skipped",
    },
  })

  return NextResponse.json({ ok: true, status: "skipped" })
}
