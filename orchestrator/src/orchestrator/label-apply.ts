import { getChatStageLabelIds, type AgentLabel } from "../db/queries/labels.js"
import { dispatchLabel } from "./response-dispatcher.js"
import { logger as rootLogger } from "../lib/logger.js"

const logger = rootLogger.child({ module: "label-apply" })

/**
 * Apply a label to a chat with the MIX rule: a STAGE label first removes the
 * chat's other stage labels (one active at a time — a clean funnel swap); an
 * additive TAG just gets added alongside. Shared by the AI tag_conversation
 * tool and the background tagger so the behaviour can't drift.
 */
export async function applyLabelWithMix(
  agentId: string,
  toJid: string,
  label: Pick<AgentLabel, "waLabelId" | "isStage">,
  appliedBy: "ai" | "operator" = "ai"
): Promise<void> {
  if (label.isStage) {
    const current = await getChatStageLabelIds(agentId, toJid)
    for (const other of current) {
      if (other === label.waLabelId) continue
      await dispatchLabel({ agentId, toJid, waLabelId: other, action: "remove" })
        .catch((err) => logger.warn({ err, agentId, other }, "stage swap — remove failed (continuing)"))
    }
  }
  await dispatchLabel({ agentId, toJid, waLabelId: label.waLabelId, action: "add", appliedBy })
}
