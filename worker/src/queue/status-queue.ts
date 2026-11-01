import { Queue, Worker, type Job } from "bullmq"
import { jidNormalizedUser, type AnyMessageContent, type WASocket } from "@whiskeysockets/baileys"
import { getRedis } from "./redis.js"
import { config } from "../config.js"
import { isLeader } from "../lib/leader.js"
import { sessionManager } from "../baileys/session-manager.js"
import { getAgentBillingInfo, getSessionByAgentId } from "../db/queries.js"
import {
  getStatusPost,
  setStatusPostStatus,
  markStatusPosted,
  listScheduledStatusPosts,
  settleInterruptedStatusPosts,
  listStatusAudience,
  getMediaItemForAgent,
  type StatusPost,
} from "../db/queries/status-posts.js"
import { statusCredits, recipientCapFor, statusJidList } from "../baileys/status-post.js"
import { transcodeStatusVideo } from "../baileys/video-transcode.js"
import { markSentByUs } from "../baileys/sent-message-cache.js"
import { assertStorageWritable } from "../baileys/auth-health.js"
import { chargeIncurredCredits, hasCreditHeadroom } from "../billing/charge.js"
import { recordEvent } from "../lib/event-log.js"
import { logger as rootLogger } from "../lib/logger.js"

const logger = rootLogger.child({ module: "status-queue" })
const QUEUE_NAME = "status-post"
// A post that comes due while its number is still reconnecting (a deploy, a
// blip) is retried for about five minutes before it fails.
const NOT_CONNECTED_ATTEMPTS = 10

type StatusJob =
  | { kind: "post"; postId: string; agentId: string; scheduledAtMs: number }
  | { kind: "delete"; postId: string; agentId: string }

class NotConnectedYet extends Error {}

const queue = new Queue<StatusJob>(QUEUE_NAME, {
  connection: getRedis(),
  defaultJobOptions: { attempts: 1, removeOnComplete: 200, removeOnFail: 500 },
})

async function connectedSocket(agentId: string): Promise<WASocket | null> {
  const sock = sessionManager.get(agentId)
  if (!sock) return null
  const session = await getSessionByAgentId(agentId)
  return session?.status === "CONNECTED" ? sock : null
}

async function audienceFor(sock: WASocket, agentId: string): Promise<{ jids: string[]; recipients: number }> {
  const ownPhone = sock.user?.id ? jidNormalizedUser(sock.user.id).split("@")[0] : null
  const billing = await getAgentBillingInfo(agentId)
  return statusJidList(await listStatusAudience(agentId), ownPhone, recipientCapFor(billing?.plan))
}

// Library items live in private R2; only the orchestrator can sign them. Signed
// at post time, not when scheduling, because the URL only lasts an hour.
async function mediaUrlFor(post: StatusPost): Promise<string> {
  const item = post.mediaItemId ? await getMediaItemForAgent(post.mediaItemId, post.agentId) : null
  if (!item) throw new Error("The media for this post was deleted from your library")
  const res = await fetch(`${config.ORCHESTRATOR_URL}/v1/media/sign?key=${encodeURIComponent(item.r2Key)}`, {
    headers: { Authorization: `Bearer ${config.ORCHESTRATOR_API_KEY}` },
  })
  if (!res.ok) throw new Error(`Couldn't load the media (${res.status})`)
  const { url } = (await res.json()) as { url: string }
  return url
}

// A text status's colour and font are send options, not content: Baileys
// ignores them inside the message object.
async function contentFor(post: StatusPost): Promise<{ content: AnyMessageContent; style: { backgroundColor?: string; font?: number } }> {
  const caption = post.text?.trim() || undefined
  if (post.kind === "text") {
    return { content: { text: post.text ?? "" }, style: { backgroundColor: post.backgroundColor ?? "#0b3d2e", font: post.font ?? 1 } }
  }
  const url = await mediaUrlFor(post)
  if (post.kind === "image") return { content: { image: { url }, caption }, style: {} }
  const { buffer, seconds } = await transcodeStatusVideo(url)
  return { content: { video: buffer, caption, mimetype: "video/mp4", seconds }, style: {} }
}

async function failPost(post: StatusPost, from: "scheduled" | "posting", message: string): Promise<void> {
  await setStatusPostStatus(post.id, [from], "failed", message)
  void recordEvent({ level: "warn", category: "status.post_failed", agentId: post.agentId, message, detail: { postId: post.id, kind: post.kind } })
}

async function processPost(job: Job<StatusJob>, data: StatusJob & { kind: "post" }): Promise<void> {
  const post = await getStatusPost(data.postId)
  // A reschedule leaves the old delayed job behind; it no longer matches.
  if (!post || post.status !== "scheduled" || post.scheduledAt.getTime() !== data.scheduledAtMs) return

  const sock = await connectedSocket(post.agentId)
  if (!sock) {
    if (job.attemptsMade + 1 < NOT_CONNECTED_ATTEMPTS) throw new NotConnectedYet("WhatsApp not connected yet")
    return failPost(post, "scheduled", "WhatsApp wasn't connected when this post was due")
  }
  if (!(await hasCreditHeadroom(post.agentId))) return failPost(post, "scheduled", "Not enough credits to post")
  if (!(await setStatusPostStatus(post.id, ["scheduled"], "posting"))) return

  try {
    const { jids, recipients } = await audienceFor(sock, post.agentId)
    if (recipients === 0) return failPost(post, "posting", "No saved contacts to post to. Save your chats to contacts first.")
    const { content, style } = await contentFor(post)
    await assertStorageWritable()
    const t0 = Date.now()
    const sent = await sock.sendMessage("status@broadcast", content, { statusJidList: jids, ...style })
    const waId = sent?.key?.id
    if (!waId) throw new Error("WhatsApp didn't return a message id")
    markSentByUs(waId)

    const credits = statusCredits(post.kind)
    let charged = 0
    try {
      await chargeIncurredCredits({ agentId: post.agentId, credits, messageType: post.kind, source: "status" })
      charged = credits
    } catch (err) {
      // Already on WhatsApp; a billing hiccup must not mark it failed or retry it.
      logger.warn({ postId: post.id, err: (err as Error)?.message }, "Status charge failed after post")
    }
    await markStatusPosted(post.id, waId, recipients, charged)
    logger.info({ postId: post.id, agentId: post.agentId, kind: post.kind, recipients, ms: Date.now() - t0 }, "Status posted")
  } catch (err) {
    await failPost(post, "posting", (err as Error)?.message ?? "Status post failed")
  }
}

// Deleting is a protocol message to the same audience, so it needs the list too.
async function processDelete(data: StatusJob & { kind: "delete" }): Promise<void> {
  const post = await getStatusPost(data.postId)
  if (!post || post.status !== "deleting" || !post.waMessageId) return
  const sock = await connectedSocket(post.agentId)
  if (!sock) {
    await setStatusPostStatus(post.id, ["deleting"], "posted", "WhatsApp isn't connected, so the post couldn't be deleted")
    return
  }
  try {
    const { jids } = await audienceFor(sock, post.agentId)
    await assertStorageWritable()
    await sock.sendMessage(
      "status@broadcast",
      { delete: { remoteJid: "status@broadcast", fromMe: true, id: post.waMessageId } },
      { statusJidList: jids },
    )
    await setStatusPostStatus(post.id, ["deleting"], "deleted")
  } catch (err) {
    await setStatusPostStatus(post.id, ["deleting"], "posted", (err as Error)?.message ?? "Delete failed")
  }
}

const worker = new Worker<StatusJob>(
  QUEUE_NAME,
  async (job: Job<StatusJob>) => {
    // Only the leader holds WhatsApp sockets — bounce the job back to it.
    if (!isLeader()) {
      await queue.add(job.name, job.data, { delay: 3_000 })
      return
    }
    if (job.data.kind === "post") await processPost(job, job.data)
    else await processDelete(job.data)
  },
  {
    connection: getRedis(),
    // One status at a time across every agent: each is an encryption burst
    // per recipient on the event loop that also serves AI replies.
    concurrency: 1,
  },
)

worker.on("failed", (job, err) => {
  if (err instanceof NotConnectedYet) return
  logger.error({ jobId: job?.id, data: job?.data, err: err.message }, "Status job failed")
})

// The job id carries the due time, so re-adding the same schedule is a no-op
// and a reschedule gets a fresh job (the old one exits on the mismatch).
export async function scheduleStatusPost(postId: string, agentId: string, scheduledAt: Date): Promise<void> {
  const scheduledAtMs = scheduledAt.getTime()
  await queue.add(
    "post",
    { kind: "post", postId, agentId, scheduledAtMs },
    {
      jobId: `post-${postId}-${scheduledAtMs}`,
      delay: Math.max(0, scheduledAtMs - Date.now()),
      attempts: NOT_CONNECTED_ATTEMPTS,
      backoff: { type: "fixed", delay: 30_000 },
    },
  )
}

export async function deleteStatusPostJob(postId: string, agentId: string): Promise<void> {
  await queue.add("delete", { kind: "delete", postId, agentId })
}

// Redis isn't backed up and delayed jobs can be lost with it; the table is the
// source of truth, so the leader re-adds every pending post on boot.
export async function restoreStatusSchedule(): Promise<void> {
  const settled = await settleInterruptedStatusPosts()
  const pending = await listScheduledStatusPosts()
  for (const p of pending) await scheduleStatusPost(p.id, p.agentId, p.scheduledAt)
  logger.info({ ...settled, scheduled: pending.length }, "Status schedule restored")
}

export async function closeStatusQueue(): Promise<void> {
  await worker.close()
  await queue.close()
}
