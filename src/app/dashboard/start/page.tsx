import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import { db } from "@/lib/db"

// Post-login landing resolver. Cloud API accounts start on the Meta tab, which
// is the whole product for them; everyone else lands on Overview as before.
// Done here rather than redirecting from /dashboard itself so those users can
// still navigate to Overview instead of being bounced back every time.
export default async function DashboardStartPage() {
  const session = await auth()
  if (!session) redirect("/login")

  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: { metaEnabled: true },
  })

  redirect(user?.metaEnabled ? "/dashboard/meta" : "/dashboard")
}
