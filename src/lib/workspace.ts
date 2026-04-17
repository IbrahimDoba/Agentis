import { db } from "@/lib/db"
import { cookies } from "next/headers"

export const WORKSPACE_COOKIE = "dzero_workspace"

export type WorkspaceContext = {
  ownerId: string
  viewerId: string
  role: "OWNER" | "ADMIN" | "MEMBER"
  isOwner: boolean
}

/**
 * Resolves the active workspace for the current session.
 * Reads the `dzero_workspace` cookie. If not set or matches the viewer,
 * the user is viewing their own workspace as OWNER.
 * Otherwise validates they are an accepted member of that workspace.
 */
export async function getWorkspaceContext(viewerId: string): Promise<WorkspaceContext> {
  const cookieStore = await cookies()
  const cookieValue = cookieStore.get(WORKSPACE_COOKIE)?.value

  // Own workspace (default)
  if (!cookieValue || cookieValue === viewerId) {
    return { ownerId: viewerId, viewerId, role: "OWNER", isOwner: true }
  }

  // Validate member access
  const member = await db.workspaceMember.findFirst({
    where: {
      workspaceId: cookieValue,
      userId: viewerId,
      status: "ACCEPTED",
    },
    select: { role: true, workspaceId: true },
  })

  if (!member) {
    // Cookie is stale / access revoked — fall back to own workspace
    return { ownerId: viewerId, viewerId, role: "OWNER", isOwner: true }
  }

  return {
    ownerId: member.workspaceId,
    viewerId,
    role: member.role as "ADMIN" | "MEMBER",
    isOwner: false,
  }
}

/**
 * Returns the workspaces a user can switch to (their own + accepted memberships).
 */
export async function getAvailableWorkspaces(userId: string) {
  const memberships = await db.workspaceMember.findMany({
    where: { userId, status: "ACCEPTED" },
    select: {
      workspaceId: true,
      role: true,
      workspace: { select: { id: true, name: true, businessName: true } },
    },
  })

  return memberships.map((m) => ({
    id: m.workspaceId,
    name: m.workspace.businessName || m.workspace.name,
    role: m.role,
  }))
}
