import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"

export async function GET() {
  const session = await auth()
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const requests = await db.paymentRequest.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      user: { select: { id: true, name: true, email: true, businessName: true, plan: true } },
    },
  })

  return NextResponse.json(requests.map((r) => ({
    id: r.id,
    reference: r.reference,
    plan: r.plan,
    amountNaira: r.amountNaira,
    status: r.status,
    notes: r.notes,
    createdAt: r.createdAt.toISOString(),
    user: r.user,
  })))
}
