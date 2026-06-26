import { auth } from "@/lib/auth"
import { redirect, notFound } from "next/navigation"
import { db } from "@/lib/db"
import NewAgentForm from "./NewAgentForm"

interface Params { params: Promise<{ id: string }> }

// A reseller admin creating an agent for one of her customers. Scoped to her
// tenant; the form posts to /api/reseller/agents which re-checks ownership.
export default async function NewResellerAgentPage({ params }: Params) {
  const session = await auth()
  if (!session) redirect("/login")
  const role = session.user.role
  if (role !== "RESELLER_ADMIN" && role !== "ADMIN") redirect("/dashboard")
  const { id } = await params

  const customer = await db.user.findFirst({
    where: { id, resellerId: session.user.resellerId },
    select: { id: true, name: true, businessName: true },
  })
  if (!customer) notFound()

  return (
    <NewAgentForm
      userId={customer.id}
      customerLabel={customer.businessName || customer.name || "this customer"}
      defaultBusinessName={customer.businessName || ""}
    />
  )
}
