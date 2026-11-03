import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { auth } from "@/lib/auth"
import { assertContactsAccess } from "@/lib/contacts-access"
import { forwardToOrchestrator } from "@/lib/media-direct-upload"
import { MAX_STATUS_VIDEO_BYTES } from "@/lib/media-limits"

interface Params {
  params: Promise<{ id: string }>
}

const BodySchema = z.object({
  filename: z.string().min(1).max(500),
  mimeType: z.string().startsWith("video/").max(100),
  sizeBytes: z.number().int().positive().max(MAX_STATUS_VIDEO_BYTES),
})

// Status only: videos this size can't be sent in a chat, so there's no reason
// to offer the bigger limit anywhere else.
export async function POST(req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const parsed = BodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: "Only videos up to 100MB can be uploaded." }, { status: 400 })

  try {
    const { id } = await params
    const access = await assertContactsAccess(id, session.user.id, session.user.role, { feature: "status", spending: true })
    if ("error" in access) return access.error

    return await forwardToOrchestrator("/v1/media/upload-url", { agentId: id, ...parsed.data }, "[POST /api/agents/:id/media/upload-url]")
  } catch (error) {
    console.error("[POST /api/agents/:id/media/upload-url]", error)
    return NextResponse.json({ error: "Failed to start the upload" }, { status: 500 })
  }
}
