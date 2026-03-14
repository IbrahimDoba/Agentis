import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import { db } from "@/lib/db"

export default async function AgentIndexPage() {
  const session = await auth()
  if (!session) redirect("/login")

  const agent = await db.agent.findFirst({
    where: { userId: session.user.id },
  })

  if (agent) {
    redirect(`/dashboard/agent/${agent.id}`)
  } else {
    redirect("/dashboard/agent/create")
  }
}
