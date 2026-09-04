import { withAdmin } from "@/lib/api/withAuth"
import { NextResponse } from "next/server"
import { db } from "@/lib/db"

export const GET = withAdmin(async () => {
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
})
