import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { MetaTestClient } from "./MetaTestClient"

export const metadata: Metadata = {
  title: "Meta Cloud API — Test Harness",
}

// Standalone testing surface for the official WhatsApp Cloud API — deliberately
// outside the dashboard shell (branch: meta-integration).
export default async function MetaTestPage() {
  const session = await auth()
  if (!session) redirect("/login")
  return <MetaTestClient />
}
