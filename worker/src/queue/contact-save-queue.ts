import { Queue, Worker, type Job } from "bullmq"
import type { WASocket } from "@whiskeysockets/baileys"
import { getRedis } from "./redis.js"
import { isLeader } from "../lib/leader.js"
import { sessionManager } from "../baileys/session-manager.js"
import { getSessionByAgentId } from "../db/queries.js"
import {
  getRun,
  listCandidateChats,
  markSavedByDailzero,
  isInAddressBook,
  recordRunProgress,
  setRunStatus,
  setRunWaiting,
  getContactSaveSettings,
} from "../db/queries/contacts.js"
import { contactSaveArgs, isJunkName, capDay, DAILY_SAVE_CAP, CREDITS_PER_CONTACT, SAVEABLE_PHONE } from "../baileys/contact-save.js"
import { chargeIncurredCredits, hasCreditHeadroom } from "../billing/charge.js"
import { truncatedNormal } from "../anti-ban/distribution.js"
import { recordEvent } from "../lib/event-log.js"
import { logger as rootLogger } from "../lib/logger.js"

const logger = rootLogger.child({ module: "contact-save-queue" })
const QUEUE_NAME = "contact-save"
const MAX_CONSECUTIVE_FAILURES = 5

// A run is a chain: each job saves one contact and schedules the next. The
// chain token stops a resume from leaving two chains alive (the old delayed job
// wakes up, sees a token that isn't current, and exits).
type ContactSaveJob =
  | { kind: "run"; runId: string; agentId: string; token: string }
  | { kind: "auto"; agentId: string; phone: string; name: string }

const tokenKey = (runId: string) => `cs:token:${runId}`
const dailyKey = (agentId: string, day: string) => `cs:daily:${agentId}:${day}`
const failuresKey = (runId: string) => `cs:failures:${runId}`
const autoSeenKey = (agentId: string, phone: string) => `cs:auto:${agentId}:${phone}`

const queue = new Queue<ContactSaveJob>(QUEUE_NAME, {
  connection: getRedis(),
  defaultJobOptions: { attempts: 1, removeOnComplete: 200, removeOnFail: 500 },
})

async function usedToday(agentId: string): Promise<number> {
  return Number(await getRedis().get(dailyKey(agentId, capDay(Date.now()).key))) || 0
}

async function countSave(agentId: string): Promise<void> {
  const { key, endsAt } = capDay(Date.now())
  const k = dailyKey(agentId, key)
  await getRedis().incr(k)
  await getRedis().pexpireat(k, endsAt + 60 * 60 * 1000)
}

// The socket can exist while the link is still coming back after a re-scan;
// a save then "succeeds" without reaching the phone.
async function connectedSocket(agentId: string): Promise<WASocket | null> {
  const sock = sessionManager.get(agentId)
  if (!sock) return null
  const session = await getSessionByAgentId(agentId)
  return session?.status === "CONNECTED" ? sock : null
}

async function saveOne(sock: WASocket, agentId: string, phone: string, name: string, tag: string | null): Promise<void> {
  const { jid, contact } = contactSaveArgs(phone, name, tag)
  await sock.addOrEditContact(jid, contact)
  await markSavedByDailzero(agentId, phone, contact.fullName)
  await countSave(agentId)
}

async function charge(agentId: string): Promise<number> {
  try {
    await chargeIncurredCredits({ agentId, credits: CREDITS_PER_CONTACT, messageType: "contact", source: "contact_save" })
    return CREDITS_PER_CONTACT
  } catch (err) {
    // The save already happened; a billing hiccup must not undo or repeat it.
    logger.warn({ agentId, err: (err as Error)?.message }, "Contact save charge failed after save")
    return 0
  }
}

async function scheduleNext(runId: string, agentId: string, token: string, delayMs: number): Promise<void> {
  await queue.add("save", { kind: "run", runId, agentId, token }, { delay: Math.max(0, delayMs) })
}

async function processRun(job: ContactSaveJob & { kind: "run" }): Promise<void> {
  const { runId, agentId, token } = job
  if ((await getRedis().get(tokenKey(runId))) !== token) return

  const run = await getRun(runId)
  if (!run || run.status !== "running") return

  const sock = await connectedSocket(agentId)
  if (!sock) {
    await setRunStatus(runId, ["running"], "paused", "disconnected")
    void recordEvent({ level: "warn", category: "contacts.save_paused", agentId, message: "Contact save paused — WhatsApp not connected", detail: { runId } })
    return
  }

  if ((await usedToday(agentId)) >= DAILY_SAVE_CAP) {
    const resumeAt = capDay(Date.now()).endsAt + truncatedNormal(5 * 60_000, 30 * 60_000)
    await setRunWaiting(runId, new Date(resumeAt))
    await scheduleNext(runId, agentId, token, resumeAt - Date.now())
    logger.info({ runId, agentId }, "Daily contact-save cap reached — continuing tomorrow")
    return
  }

  if (!(await hasCreditHeadroom(agentId))) {
    await setRunStatus(runId, ["running"], "paused", "no_credits")
    void recordEvent({ level: "warn", category: "contacts.save_paused", agentId, message: "Contact save paused — insufficient credits", detail: { runId } })
    return
  }

  // Junk names are stepped over by moving the cursor, so a page of them can't
  // stall the run.
  const page = await listCandidateChats(agentId, run.cursor, 25)
  const next = page.find((c) => !c.junk)
  if (!next) {
    if (page.length === 25) {
      await recordRunProgress(runId, { cursor: page[page.length - 1].id })
      await scheduleNext(runId, agentId, token, 0)
      return
    }
    await setRunStatus(runId, ["running"], "completed")
    await getRedis().del(tokenKey(runId), failuresKey(runId))
    logger.info({ runId, agentId }, "Contact save run completed")
    return
  }

  try {
    await saveOne(sock, agentId, next.phone, next.name, run.nameTag)
    const credits = await charge(agentId)
    await recordRunProgress(runId, { cursor: next.id, saved: true, credits })
    await getRedis().del(failuresKey(runId))
  } catch (err) {
    await recordRunProgress(runId, { cursor: next.id, failed: true })
    void recordEvent({ level: "warn", category: "contacts.save_failed", agentId, message: (err as Error)?.message ?? "contact save failed", detail: { runId, chatId: next.id } })
    const failures = await getRedis().incr(failuresKey(runId))
    await getRedis().expire(failuresKey(runId), 3600)
    if (failures >= MAX_CONSECUTIVE_FAILURES) {
      await setRunStatus(runId, ["running"], "paused", "failing")
      await getRedis().del(failuresKey(runId))
      void recordEvent({ level: "error", category: "contacts.save_paused", agentId, message: "Contact save paused — repeated failures", detail: { runId, failures } })
      return
    }
  }

  await scheduleNext(runId, agentId, token, truncatedNormal(3_000, 6_000))
}

async function processAuto(job: ContactSaveJob & { kind: "auto" }): Promise<void> {
  const { agentId, phone, name } = job
  const settings = await getContactSaveSettings(agentId)
  if (!settings.autoSaveContacts) return
  if (await isInAddressBook(agentId, phone)) return
  if ((await usedToday(agentId)) >= DAILY_SAVE_CAP) return
  if (!(await hasCreditHeadroom(agentId))) return
  const sock = await connectedSocket(agentId)
  if (!sock) return

  try {
    await saveOne(sock, agentId, phone, name, settings.contactNameTag)
    await charge(agentId)
    logger.info({ agentId, phone: phone.slice(0, 6) + "*****" }, "Auto-saved new chat to contacts")
  } catch (err) {
    void recordEvent({ level: "warn", category: "contacts.auto_save_failed", agentId, message: (err as Error)?.message ?? "auto-save failed", detail: { phone } })
  }
}

const worker = new Worker<ContactSaveJob>(
  QUEUE_NAME,
  async (job: Job<ContactSaveJob>) => {
    // Only the leader holds WhatsApp sockets — bounce the job back to it.
    if (!isLeader()) {
      await queue.add(job.name, job.data, { delay: 3_000 })
      return
    }
    if (job.data.kind === "run") await processRun(job.data)
    else await processAuto(job.data)
  },
  {
    connection: getRedis(),
    concurrency: 1, // one save at a time across all agents — anti-ban, like broadcasts
  },
)

worker.on("failed", (job, err) => {
  logger.error({ jobId: job?.id, data: job?.data, err: err.message }, "Contact save job failed")
})

// Starts (or resumes) a run's chain under a fresh token, retiring any older one.
export async function startRunChain(runId: string, agentId: string): Promise<void> {
  const token = Math.random().toString(36).slice(2)
  await getRedis().set(tokenKey(runId), token, "EX", 60 * 60 * 24 * 30)
  await scheduleNext(runId, agentId, token, 0)
}

export async function stopRunChain(runId: string): Promise<void> {
  await getRedis().del(tokenKey(runId), failuresKey(runId))
}

// Called for every 1:1 inbound. Cheap checks first; the SET NX makes sure a
// chatty customer is only tried once a week, not on every message.
export async function maybeAutoSave(agentId: string, phone: string, name: string | null | undefined): Promise<void> {
  if (!name || isJunkName(name) || !SAVEABLE_PHONE.test(phone)) return
  const settings = await getContactSaveSettings(agentId)
  if (!settings.autoSaveContacts) return
  if (await isInAddressBook(agentId, phone)) return
  const fresh = await getRedis().set(autoSeenKey(agentId, phone), "1", "EX", 60 * 60 * 24 * 7, "NX")
  if (!fresh) return
  await queue.add("auto", { kind: "auto", agentId, phone, name: name.trim() }, { delay: truncatedNormal(20_000, 90_000) })
}

export async function closeContactSaveQueue(): Promise<void> {
  await worker.close()
  await queue.close()
}
