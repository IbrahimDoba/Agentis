import { resolveProvider } from "../providers/registry.js"
import {
  claimAutoBuilds,
  findAbandonedAutoBuilds,
  finishAutoBuild,
  getAutoBuildProfile,
  getRecentChatsForAutoBuild,
  type AutoBuildResult,
} from "../db/queries/auto-build.js"
import {
  AUTO_BUILD_SYSTEM_PROMPT,
  buildAutoBuildUserPrompt,
  composeDraftGuidelines,
  composeProfileOnlyGuidelines,
  parseAutoBuildDraft,
  removeUnseenPrices,
  type AutoBuildDraft,
  type AutoBuildProfile,
} from "./auto-build-draft.js"
import { logger as rootLogger } from "../lib/logger.js"

const logger = rootLogger.child({ module: "auto-build" })

const SWEEP_INTERVAL_MS = 5_000
const SWEEP_LIMIT = 5
const AUTO_BUILD_MODEL = "gpt-4o-mini"
const LLM_TIMEOUT_MS = 45_000
// Long enough for the profile import that runs alongside a fast history sync.
const PROFILE_GRACE_SECONDS = 5
// Accounts on full history sync can keep sending chunks for many minutes. We
// only need the latest chats, so build with whatever has landed by then.
const MAX_WAIT_SECONDS = 60
const ABANDONED_AFTER_SECONDS = 180

let sweepTimer: NodeJS.Timeout | null = null
let sweeping = false

async function draftFromChats(agentId: string, profile: AutoBuildProfile): Promise<AutoBuildDraft | null> {
  const chats = await getRecentChatsForAutoBuild(agentId)
  if (chats.length === 0) return null

  const call = resolveProvider(AUTO_BUILD_MODEL).chat({
    model: AUTO_BUILD_MODEL,
    system: AUTO_BUILD_SYSTEM_PROMPT,
    messages: [{ role: "user", content: buildAutoBuildUserPrompt(profile, chats) }],
    temperature: 0.3,
    max_output_tokens: 1800,
  })
  const timeout = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error("Auto-build model call timed out")), LLM_TIMEOUT_MS).unref()
  })
  const result = await Promise.race([call, timeout])

  const draft = parseAutoBuildDraft(result.content)
  if (!draft) throw new Error(`Unusable model output (finish_reason: ${result.finish_reason})`)
  logger.info(
    { agentId, chats: chats.length, inputTokens: result.usage.input_tokens, outputTokens: result.usage.output_tokens },
    "Auto-build draft generated"
  )
  return removeUnseenPrices(draft, chats)
}

async function buildAgent(agentId: string, useModel: boolean): Promise<void> {
  const profile = await getAutoBuildProfile(agentId)
  if (!profile) return

  let draft: AutoBuildDraft | null = null
  if (useModel) {
    // Any failure drops to the profile-only agent. Owners can always edit it,
    // whereas a failed build would leave them with the AI off and no way forward.
    draft = await draftFromChats(agentId, profile).catch((err) => {
      logger.warn({ agentId, err: err?.message }, "Auto-build draft failed — using the profile only")
      return null
    })
  }

  const result: AutoBuildResult = draft
    ? {
        guidelines: composeDraftGuidelines(profile, draft),
        description: draft.description || null,
        productsServices:
          draft.products.map((p) => `${p.name}${p.price ? `: ${p.price}` : ""}`).join("\n") || null,
        faqs: draft.faqs.map((f) => `Q: ${f.question}\nA: ${f.answer}`).join("\n\n") || null,
      }
    : { guidelines: composeProfileOnlyGuidelines(profile), description: null, productsServices: null, faqs: null }

  const finished = await finishAutoBuild(agentId, result)
  logger.info({ agentId, finished, fromChats: !!draft }, "Auto-build finished")
}

async function runSweep(): Promise<void> {
  const abandoned = await findAbandonedAutoBuilds(SWEEP_LIMIT, ABANDONED_AFTER_SECONDS)
  const claimed = await claimAutoBuilds(SWEEP_LIMIT, MAX_WAIT_SECONDS, PROFILE_GRACE_SECONDS)

  await Promise.all([
    ...abandoned.map((id) => buildAgent(id, false)),
    ...claimed.map((id) => buildAgent(id, true)),
  ])
}

// Interval sweep, not a queue: the status column in Postgres is the job, so a
// redeploy mid-build loses nothing and the worker needs no way to reach us.
export function startAutoBuildSweep(): void {
  sweepTimer = setInterval(() => {
    if (sweeping) return // a slow build must not stack a second sweep
    sweeping = true
    runSweep()
      .catch((err) => logger.error({ err: err?.message }, "Auto-build sweep crashed"))
      .finally(() => {
        sweeping = false
      })
  }, SWEEP_INTERVAL_MS)
  sweepTimer.unref()
}

export function stopAutoBuildSweep(): void {
  if (sweepTimer) clearInterval(sweepTimer)
  sweepTimer = null
}
