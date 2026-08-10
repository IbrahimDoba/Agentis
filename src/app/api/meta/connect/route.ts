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

  const connections = await db.metaTestConnection.findMany({
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
    },
  })

  return NextResponse.json({
    connections: connections.map((c) => ({
      ...c,
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

  try {
    const accessToken = await exchangeCodeForToken(code)
    const details = await getNumberDetails(phoneNumberId, accessToken)
    const saved = await saveConnection({
      wabaId,
      phoneNumberId,
      businessId: typeof body?.businessId === "string" ? body.businessId : null,
      accessToken,
      details,
    })

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
