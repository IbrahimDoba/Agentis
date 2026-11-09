import type { Metadata } from "next"
import { getTenantBranding } from "@/lib/tenant"

// The (auth) layout titles every page "Sign in"; signup is the one page where that's wrong.
export async function generateMetadata(): Promise<Metadata> {
  const brand = await getTenantBranding()
  return { title: `Create your account · ${brand.appName}` }
}

export default function SignupLayout({ children }: { children: React.ReactNode }) {
  return children
}
