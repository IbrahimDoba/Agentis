import type { Metadata } from "next"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { redirect } from "next/navigation"
import { cookies } from "next/headers"
import { DashboardShell } from "@/components/dashboard/DashboardShell"
import { TrialBanner } from "@/components/dashboard/TrialBanner"
import { getTenantBranding, brandingIcons } from "@/lib/tenant"
import { BrandProvider } from "@/components/BrandProvider"

// Tenant-aware tab title + favicon so a reseller's customers see her brand.
export async function generateMetadata(): Promise<Metadata> {
  const brand = await getTenantBranding()
  return {
    title: `Dashboard · ${brand.appName}`,
    icons: brandingIcons(brand),
  }
}

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()

  if (!session) {
    redirect("/login")
  }

  // Trial state for the soft "choose a plan" wall (platform free users only).
  let trialUser: { plan: string | null; resellerId: string | null; subscriptionExpiresAt: Date | null } | null = null

  // Only check onboarding for approved users
  if (session.user.status === "APPROVED") {
    const user = await db.user.findUnique({
      where: { id: session.user.id },
      select: {
        onboardingCompleted: true,
        maxAgents: true,
        plan: true,
        resellerId: true,
        subscriptionExpiresAt: true,
        _count: { select: { agents: true } },
      },
    })
    if (user) {
      trialUser = {
        plan: user.plan,
        resellerId: user.resellerId,
        subscriptionExpiresAt: user.subscriptionExpiresAt,
      }
    }
    if (user && !user.onboardingCompleted) {
      // If they already have an agent or hit their limit, skip onboarding
      const hasAgent = user._count.agents > 0
      const atLimit = user._count.agents >= user.maxAgents
      if (hasAgent || atLimit) {
        // Silently mark onboarding complete so they never get redirected again
        await db.user.update({
          where: { id: session.user.id },
          data: { onboardingCompleted: true },
        })
      } else {
        redirect("/onboarding")
      }
    }
  }

  const cookieStore = await cookies()
  const currentWorkspaceId = cookieStore.get("dzero_workspace")?.value ?? null

  // Tenant brand for the whole dashboard (so client components can useBrand()).
  // The accent is applied via a display:contents wrapper so the layout is
  // unaffected but the CSS variable still cascades.
  const branding = await getTenantBranding()
  const accentStyle: React.CSSProperties = { display: "contents" }
  if (branding.primaryColor) (accentStyle as Record<string, string>)["--accent"] = branding.primaryColor

  return (
    <BrandProvider branding={branding}>
      <div style={accentStyle}>
        <DashboardShell
          userName={session.user.name ?? "User"}
          businessName={session.user.businessName ?? ""}
          currentUserId={session.user.id}
          currentWorkspaceId={currentWorkspaceId}
        >
          {trialUser && <TrialBanner user={trialUser} />}
          {children}
        </DashboardShell>
      </div>
    </BrandProvider>
  )
}
