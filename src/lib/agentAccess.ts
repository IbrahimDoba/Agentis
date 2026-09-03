import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { getWorkspaceContext } from "@/lib/workspace"
import { agentBelongsTo } from "@/lib/queries/agents"

// Shared guard for routes that take an agentId from the request and act on it.
//
// These routes used to check only that *a* session existed, then forwarded the
// caller's agentId straight to the worker — so any logged-in user could read
// another tenant's WhatsApp pairing QR or kill their session.
//
// Access follows the same tenancy the dashboard already uses to LIST agents
// (/api/agents scopes by getWorkspaceContext().ownerId), so a workspace member
// keeps the access they have today. ADMIN is allowed through because the admin
// Sessions panel operates across tenants.
//
// Denial collapses "no such agent" into "not yours": the scoped lookup cannot
// tell them apart, and that is deliberate — it stops the endpoint being used to
// probe which agentIds exist. Callers render it as 404, not 403.

export type Viewer = { viewerId: string; isAdmin: boolean }

export type AgentAccess =
  | { ok: true; viewer: Viewer }
  | { ok: false; reason: "UNAUTHENTICATED" | "NO_ACCESS" }

/** Session only. Split out so a route can answer 401 before reading a body. */
export async function requireViewer(): Promise<Viewer | null> {
  const session = await auth()
  if (!session?.user?.id) return null
  return { viewerId: session.user.id, isAdmin: session.user.role === "ADMIN" }
}

export async function viewerCanAccessAgent(viewer: Viewer, agentId: string): Promise<boolean> {
  if (viewer.isAdmin) return true
  const { ownerId } = await getWorkspaceContext(viewer.viewerId)
  return agentBelongsTo(db, agentId, ownerId)
}

/** The common case: agentId is already known from the path. */
export async function requireAgentAccess(agentId: string): Promise<AgentAccess> {
  const viewer = await requireViewer()
  if (!viewer) return { ok: false, reason: "UNAUTHENTICATED" }
  if (!(await viewerCanAccessAgent(viewer, agentId))) {
    return { ok: false, reason: "NO_ACCESS" }
  }
  return { ok: true, viewer }
}
