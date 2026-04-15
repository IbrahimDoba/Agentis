import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"

interface Params {
  params: Promise<{ id: string }>
}

export async function POST(req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id } = await params

  const request = await db.paymentRequest.findUnique({
    where: { id },
    include: { user: { select: { id: true } } },
  })

  if (!request) return NextResponse.json({ error: "Not found" }, { status: 404 })
  if (request.status !== "PENDING") {
    return NextResponse.json({ error: "Request is not pending" }, { status: 400 })
  }

  // Set expiry to 1 month from now
  const expiresAt = new Date()
  expiresAt.setMonth(expiresAt.getMonth() + 1)

  await Promise.all([
    db.paymentRequest.update({
      where: { id },
      data: { status: "PAID" },
    }),
    db.user.update({
      where: { id: request.user.id },
      data: { plan: request.plan, subscriptionExpiresAt: expiresAt },
    }),
  ])

  return NextResponse.json({ success: true })
}
