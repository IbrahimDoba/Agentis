import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { auth } from "@/lib/auth"
import { assertContactsAccess } from "@/lib/contacts-access"
import { forwardToOrchestrator } from "@/lib/media-direct-upload"

interface Params {
  params: Promise<{ id: string }>
}

const BodySchema = z.object({
  r2Key: z.string().min(1).max(1024),
  filename: z.string().min(1).max(500),
  description: z.string().trim().min(1).max(2000),
})

export async function POST(req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const parsed = BodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: "Invalid upload" }, { status: 400 })

  try {
    const { id } = await params
    const access = await assertContactsAccess(id, session.user.id, session.user.role, { feature: "status" })
    if ("error" in access) return access.error

    return await forwardToOrchestrator("/v1/media/complete", { agentId: id, ...parsed.data }, "[POST /api/agents/:id/media/complete]")
  } catch (error) {
    console.error("[POST /api/agents/:id/media/complete]", error)
    return NextResponse.json({ error: "Failed to save the upload" }, { status: 500 })
  }
}
