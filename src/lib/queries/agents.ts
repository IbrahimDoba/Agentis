import type { PrismaClient } from "@/generated/prisma/client"

/**
 * Does this agent belong to this workspace owner?
 *
 * Scoped findFirst on purpose: it cannot distinguish "no such agent" from "not
 * yours", and callers rely on that. Routes that take an agentId from the URL
 * render both as 404 so the endpoint can't be used to probe which agentIds
 * exist on the platform.
 */
export async function agentBelongsTo(
  db: Pick<PrismaClient, "agent">,
  agentId: string,
  ownerId: string
): Promise<boolean> {
  const agent = await db.agent.findFirst({
    where: { id: agentId, userId: ownerId },
    select: { id: true },
  })
  return agent !== null
}
