import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { createApiKey, listApiKeysForUser } from "@/lib/apiKey"
import { createApiKeySchema } from "@/lib/validations"

// Dashboard-facing (session-authed) management of the caller's own API keys.
// This is the "front desk" where a user mints/lists keys; the keys themselves
// authenticate the separate /v1 developer API.

// GET /api/api-keys — list the signed-in user's keys (never returns the hash).
export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const keys = await listApiKeysForUser(session.user.id)
  return NextResponse.json({ keys })
}

// POST /api/api-keys — create a key. The raw key is returned ONCE here and is
// never retrievable again.
export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const parsed = createApiKeySchema.safeParse(body)
  if (!parsed.success) {
    const errors: Record<string, string> = {}
    parsed.error.issues.forEach((i) => {
      errors[i.path[0] as string] = i.message
    })
    return NextResponse.json({ errors }, { status: 400 })
  }

  const { raw, record } = await createApiKey(session.user.id, parsed.data)

  return NextResponse.json(
    {
      // Surface the raw key once — the client must show + let the user copy it now.
      key: raw,
      record: {
        id: record.id,
        name: record.name,
        prefix: record.prefix,
        scopes: record.scopes,
        status: record.status,
        dailySpendingCapCredits: record.dailySpendingCapCredits,
        dailySpentCredits: record.dailySpentCredits,
        lastUsedAt: record.lastUsedAt,
        createdAt: record.createdAt,
        revokedAt: record.revokedAt,
      },
    },
    { status: 201 }
  )
}
