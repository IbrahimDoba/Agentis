import { useMultiFileAuthState } from "@whiskeysockets/baileys"
import { readFile, writeFile, mkdir, rm } from "fs/promises"
import { existsSync } from "fs"
import path from "path"
import { encrypt, decrypt } from "../lib/crypto.js"
import { supabase } from "../db/supabase.js"
import { config } from "../config.js"
import { logger } from "../lib/logger.js"

// Configurable so it can point at a PERSISTENT Railway volume — when the auth
// folder survives restarts, the worker stops re-downloading every agent's
// backup from Supabase on each boot (the main Supabase egress source).
const AUTH_BASE = path.resolve(config.AUTH_STORAGE_DIR)

function sessionDir(agentId: string) {
  return path.join(AUTH_BASE, agentId)
}

/**
 * One-time reclaim: delete every local `.enc` backup across all agents.
 *
 * We no longer keep local `.enc` copies — they DOUBLED the file count and, on a
 * volume with many tiny auth files, exhausted its INODES → ENOSPC ("no space
 * left") even with GBs of bytes free → sessions couldn't save → decrypt failures
 * → duplicate-delivery storm.
 *
 * Run this on startup, BEFORE any session tries to save: deleting files frees
 * inodes even when the filesystem is "full", so a worker booting on a jammed
 * volume self-heals with no manual shell access. Safe — only the backup copies
 * are removed; Baileys' live plaintext files are untouched.
 */
export async function reclaimEncBackups(): Promise<number> {
  const { readdirSync, existsSync: exists } = await import("fs")
  if (!exists(AUTH_BASE)) return 0
  let removed = 0
  let agents: string[] = []
  try {
    agents = readdirSync(AUTH_BASE, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
  } catch (err) {
    logger.warn({ err }, "reclaimEncBackups: could not list auth dir")
    return 0
  }
  for (const agent of agents) {
    const dir = path.join(AUTH_BASE, agent)
    let files: string[] = []
    try { files = readdirSync(dir) } catch { continue }
    for (const f of files) {
      if (!f.endsWith(".enc")) continue
      try { await rm(path.join(dir, f), { force: true }); removed++ } catch { /* ignore */ }
    }
  }
  if (removed > 0) logger.info({ removed }, "Reclaimed local .enc backups on startup (freed inodes)")
  return removed
}

/**
 * Returns a Baileys auth state that:
 * - Stores auth files locally, encrypted at rest (AES-256-GCM)
 * - Mirrors to Supabase Storage on every save
 */
export async function getEncryptedAuthState(agentId: string) {
  const dir = sessionDir(agentId)
  await mkdir(dir, { recursive: true })

  // Restore from Supabase Storage if local dir is empty
  const localFiles = existsSync(dir)
    ? (await import("fs")).readdirSync(dir)
    : []

  if (localFiles.length === 0) {
    await restoreFromStorage(agentId, dir)
  }

  // Wrap useMultiFileAuthState with encryption/decryption
  const { state, saveCreds } = await useMultiFileAuthState(dir)

  const saveCredsEncrypted = async () => {
    await saveCreds()
    await backupToStorage(agentId, dir)
  }

  return { state, saveCreds: saveCredsEncrypted }
}

let bucketExists: boolean | null = null

// Back up the auth state to Supabase Storage. We encrypt each plaintext file
// IN MEMORY and upload it — we do NOT keep a local `.enc` copy. Keeping the .enc
// duplicate on disk doubled the auth-session footprint (Baileys already writes
// one file per contact/pre-key/session), which filled the worker's disk and
// caused ENOSPC → session-save failures → decrypt/retry storms → duplicate
// deliveries. Storing only the plaintext Baileys needs halves the disk usage.
async function backupToStorage(agentId: string, dir: string) {
  // Check bucket exists once; skip silently if not found
  if (bucketExists === null) {
    const { data, error } = await supabase.storage.getBucket(config.AUTH_STORAGE_BUCKET)
    bucketExists = !error && !!data
    if (!bucketExists) {
      logger.warn({ bucket: config.AUTH_STORAGE_BUCKET }, "Auth backup bucket not found — skipping storage backup. Create the bucket in Supabase to enable backups.")
      return
    }
  }
  if (!bucketExists) return

  const { readdirSync } = await import("fs")
  const allFiles = readdirSync(dir)
  // Only the plaintext files Baileys maintains — the .enc copies live in Supabase.
  const plainFiles = allFiles.filter((f) => !f.endsWith(".enc"))

  // Reclaim space from any local .enc left over from the old dual-write scheme
  // (previous deploys wrote a .enc for every file). One-time cleanup on save.
  for (const f of allFiles) {
    if (f.endsWith(".enc")) {
      try { await rm(path.join(dir, f), { force: true }) } catch { /* ignore */ }
    }
  }

  for (const file of plainFiles) {
    try {
      const plain = await readFile(path.join(dir, file))
      const enc = encrypt(plain) // encrypt in memory — no local .enc written
      const storagePath = `${agentId}/${file}.enc`
      const { error } = await supabase.storage
        .from(config.AUTH_STORAGE_BUCKET)
        .upload(storagePath, enc, { upsert: true, contentType: "application/octet-stream" })
      if (error) logger.warn({ error, file }, "Failed to backup auth file to storage")
    } catch (err) {
      logger.warn({ err, file }, "Failed to backup auth file")
    }
  }

  // Prune backups in storage whose local plaintext is gone (used pre-keys,
  // rotated sessions). uploads are upsert-only and never deleted, so without
  // this the bucket keeps every rotated key forever — bloating each restore.
  try {
    const localSet = new Set(plainFiles.map((f) => `${f}.enc`))
    const { data: remote } = await supabase.storage.from(config.AUTH_STORAGE_BUCKET).list(agentId)
    const stale = (remote ?? [])
      .filter((f) => !localSet.has(f.name))
      .map((f) => `${agentId}/${f.name}`)
    if (stale.length > 0) {
      await supabase.storage.from(config.AUTH_STORAGE_BUCKET).remove(stale)
      logger.info({ agentId, pruned: stale.length }, "Pruned stale auth backups from storage")
    }
  } catch (err) {
    logger.warn({ err, agentId }, "Failed to prune stale auth backups")
  }
}

async function restoreFromStorage(agentId: string, dir: string) {
  try {
    const { data: files, error } = await supabase.storage
      .from(config.AUTH_STORAGE_BUCKET)
      .list(agentId)

    if (error || !files?.length) return

    for (const file of files) {
      const storagePath = `${agentId}/${file.name}`
      const { data, error: downloadError } = await supabase.storage
        .from(config.AUTH_STORAGE_BUCKET)
        .download(storagePath)

      if (downloadError || !data) continue

      const encBuf = Buffer.from(await data.arrayBuffer())
      const plainBuf = decrypt(encBuf)
      const localName = file.name.replace(/\.enc$/, "")
      await writeFile(path.join(dir, localName), plainBuf)
    }

    logger.info({ agentId }, "Auth state restored from Supabase Storage")
  } catch (err) {
    logger.warn({ err, agentId }, "Failed to restore auth state from storage")
  }
}

/**
 * Securely delete auth files for a session.
 * Overwrites with random bytes before unlinking.
 */
export async function purgeAuthFiles(agentId: string) {
  const dir = sessionDir(agentId)
  if (!existsSync(dir)) return

  const { readdirSync } = await import("fs")
  const files = readdirSync(dir)

  for (const file of files) {
    const filePath = path.join(dir, file)
    try {
      const stat = (await import("fs")).statSync(filePath)
      const { randomBytes } = await import("crypto")
      await writeFile(filePath, randomBytes(stat.size))
    } catch {
      // ignore
    }
  }

  await rm(dir, { recursive: true, force: true })
  logger.info({ agentId }, "Auth files purged")

  // Remove from Supabase Storage
  try {
    const { data: files } = await supabase.storage.from(config.AUTH_STORAGE_BUCKET).list(agentId)
    if (files?.length) {
      await supabase.storage
        .from(config.AUTH_STORAGE_BUCKET)
        .remove(files.map((f) => `${agentId}/${f.name}`))
    }
  } catch (err) {
    logger.warn({ err, agentId }, "Failed to remove auth backup from storage")
  }
}
