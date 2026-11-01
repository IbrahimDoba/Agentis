import type { FastifyPluginAsync } from "fastify"
import type { WASocket } from "@whiskeysockets/baileys"
import { z } from "zod"
import { sessionManager } from "../baileys/session-manager.js"
import { getRedis } from "../queue/redis.js"
import {
  countAddressBook,
  countSaveableChats,
  createRunIfNone,
  getLatestRun,
  getRun,
  setRunStatus,
  getContactSaveSettings,
  invalidateContactSaveSettings,
} from "../db/queries/contacts.js"
import { startRunChain, stopRunChain } from "../queue/contact-save-queue.js"
import { hasCreditHeadroom } from "../billing/charge.js"
import { DAILY_SAVE_CAP, CREDITS_PER_CONTACT } from "../baileys/contact-save.js"
import { logger as rootLogger } from "../lib/logger.js"

const logger = rootLogger.child({ module: "routes/contacts" })
const syncedKey = (agentId: string, kind: "auto" | "manual") => `cs:synced:${kind}:${agentId}`

// Contacts live in the critical_unblock_low app-state collection. Re-reading
// just that one re-emits the whole address book as contacts.upsert (which
// session-manager mirrors into WhatsAppContact) without replaying chats or
// labels. Baileys only asks WhatsApp for a full snapshot when it has no stored
// version for the collection; with one it fetches the delta since then, which
// is usually empty. So the stored version is dropped first, exactly the state
// of a freshly linked device. Throttled: the snapshot is the whole address book.
async function syncAddressBook(sock: WASocket, agentId: string, kind: "auto" | "manual", minGapSeconds: number): Promise<boolean> {
  const fresh = await getRedis().set(syncedKey(agentId, kind), String(Date.now()), "EX", minGapSeconds, "NX")
  if (!fresh) return false
  ;(async () => {
    await sock.authState.keys.set({ "app-state-sync-version": { critical_unblock_low: null } })
    await sock.resyncAppState(["critical_unblock_low"], true)
  })().catch((err) => {
    logger.warn({ agentId, err: (err as Error)?.message }, "Address book resync failed")
    void getRedis().del(syncedKey(agentId, kind))
  })
  return true
}

export const contactRoutes: FastifyPluginAsync = async (app) => {
  // Everything the Contacts tab shows. Opening the tab refreshes the mirror of
  // the phone's address book at most once a day, so the counts reflect contacts
  // the owner added by hand since.
  app.get("/contacts/summary", async (req, reply) => {
    const { agentId } = z.object({ agentId: z.string().min(1) }).parse(req.query)
    const sock = sessionManager.get(agentId)
    const syncing = sock ? await syncAddressBook(sock, agentId, "auto", 60 * 60 * 24) : false
    const [addressBook, unsaved, run, settings] = await Promise.all([
      countAddressBook(agentId),
      countSaveableChats(agentId),
      getLatestRun(agentId),
      getContactSaveSettings(agentId),
    ])
    return reply.send({
      addressBook,
      unsaved,
      run,
      syncing,
      settings,
      dailyCap: DAILY_SAVE_CAP,
      creditsPerContact: CREDITS_PER_CONTACT,
    })
  })

  app.post("/contacts/sync", async (req, reply) => {
    const { agentId } = z.object({ agentId: z.string().min(1) }).parse(req.body)
    const sock = sessionManager.get(agentId)
    if (!sock) return reply.code(409).send({ error: "WhatsApp session is not connected" })
    const started = await syncAddressBook(sock, agentId, "manual", 10 * 60)
    return reply.send({ started })
  })

  app.post("/contacts/settings/invalidate", async (req, reply) => {
    const { agentId } = z.object({ agentId: z.string().min(1) }).parse(req.body)
    invalidateContactSaveSettings(agentId)
    return reply.send({ ok: true })
  })

  app.post("/contacts/runs", async (req, reply) => {
    const { agentId } = z.object({ agentId: z.string().min(1) }).parse(req.body)
    if (!sessionManager.get(agentId)) return reply.code(409).send({ error: "WhatsApp is not connected" })
    if (!(await hasCreditHeadroom(agentId))) return reply.code(402).send({ error: "Not enough credits to save contacts" })

    // An empty mirror means we haven't read the phone's address book yet, not
    // that it's empty — saving now would rename every contact the owner has.
    if ((await countAddressBook(agentId)).total === 0) {
      return reply.code(409).send({ error: "Still reading your phone's contacts. Try again in a minute." })
    }

    const total = await countSaveableChats(agentId)
    if (total === 0) return reply.code(409).send({ error: "Every chat with a name is already in your contacts" })

    // The tag is fixed per run: changing it mid-run would leave half the batch
    // tagged one way and half the other.
    invalidateContactSaveSettings(agentId)
    const { contactNameTag } = await getContactSaveSettings(agentId)
    const { run, created } = await createRunIfNone(agentId, total, contactNameTag)
    if (!created) return reply.code(409).send({ error: "A save run is already in progress", run })

    await startRunChain(run.id, agentId)
    logger.info({ agentId, runId: run.id, total }, "Contact save run started")
    return reply.code(201).send({ run })
  })

  app.post("/contacts/runs/:runId/:action", async (req, reply) => {
    const { runId, action } = z.object({
      runId: z.string().min(1),
      action: z.enum(["pause", "resume", "cancel"]),
    }).parse(req.params)
    const { agentId } = z.object({ agentId: z.string().min(1) }).parse(req.body)

    const run = await getRun(runId)
    if (!run || run.agentId !== agentId) return reply.code(404).send({ error: "Run not found" })

    if (action === "pause") {
      if (!(await setRunStatus(runId, ["running"], "paused", "owner"))) return reply.code(409).send({ error: "Run is not running" })
      await stopRunChain(runId)
    } else if (action === "cancel") {
      if (!(await setRunStatus(runId, ["running", "paused"], "cancelled"))) return reply.code(409).send({ error: "Run already finished" })
      await stopRunChain(runId)
    } else {
      if (!sessionManager.get(agentId)) return reply.code(409).send({ error: "WhatsApp is not connected" })
      if (!(await hasCreditHeadroom(agentId))) return reply.code(402).send({ error: "Not enough credits to save contacts" })
      if (!(await setRunStatus(runId, ["paused"], "running"))) return reply.code(409).send({ error: "Run is not paused" })
      await startRunChain(runId, agentId)
    }
    return reply.send({ run: await getRun(runId) })
  })
}
