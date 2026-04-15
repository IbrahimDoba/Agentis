import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { PLAN_PRICES } from "@/lib/plans"
import { z } from "zod"

const schema = z.object({
  plan: z.enum(["starter", "pro", "enterprise"]),
})

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await req.json()
  const parsed = schema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: "Invalid plan" }, { status: 400 })

  const { plan } = parsed.data
  const amountNaira = PLAN_PRICES[plan] ?? 0

  // Cancel any existing pending request for this user first
  await db.paymentRequest.updateMany({
    where: { userId: session.user.id, status: "PENDING" },
    data: { status: "CANCELLED" },
  })

  const request = await db.paymentRequest.create({
    data: {
      userId: session.user.id,
      plan,
      amountNaira,
    },
  })

  return NextResponse.json({
    id: request.id,
    reference: request.reference,
    plan: request.plan,
    amountNaira: request.amountNaira,
    status: request.status,
    createdAt: request.createdAt.toISOString(),
  })
}

export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const requests = await db.paymentRequest.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
    take: 10,
  })

  return NextResponse.json(requests.map((r) => ({
    id: r.id,
    reference: r.reference,
    plan: r.plan,
    amountNaira: r.amountNaira,
    status: r.status,
    createdAt: r.createdAt.toISOString(),
  })))
}
