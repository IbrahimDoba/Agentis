import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import { AdminEventsClient } from "@/components/admin/AdminEventsClient"

export default async function AdminEventsPage() {
  const session = await auth()
  if (!session || session.user.role !== "ADMIN") redirect("/dashboard")
  return <AdminEventsClient />
}
