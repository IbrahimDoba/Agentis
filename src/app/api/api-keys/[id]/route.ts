import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { revokeApiKeyForUser } from "@/lib/apiKey"

interface Params {
  params: Promise<{ id: string }>
}

// DELETE /api/api-keys/:id — revoke one of the signed-in user's keys. Scoped to
// the owner: revoking a key that isn't yours returns 404 (no cross-user revoke,
// no leaking which key ids exist).
export async function DELETE(_req: Request, { params }: Params) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  const revoked = await revokeApiKeyForUser(session.user.id, id)
  if (!revoked) return NextResponse.json({ error: "Not found" }, { status: 404 })

  return NextResponse.json({ ok: true })
}
