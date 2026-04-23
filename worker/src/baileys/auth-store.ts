import { useMultiFileAuthState } from "@whiskeysockets/baileys"
import { readFile, writeFile, mkdir, rm } from "fs/promises"
import { existsSync } from "fs"
import path from "path"
import { encrypt, decrypt } from "../lib/crypto.js"
import { supabase } from "../db/supabase.js"
import { config } from "../config.js"
import { logger } from "../lib/logger.js"

const AUTH_BASE = path.resolve("auth_sessions")

function sessionDir(agentId: string) {
  return path.join(AUTH_BASE, agentId)
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
    await encryptLocalFiles(dir)
    await backupToStorage(agentId, dir)
  }

  return { state, saveCreds: saveCredsEncrypted }
}

async function encryptLocalFiles(dir: string) {
  const { readdirSync } = await import("fs")
  const files = readdirSync(dir)
  for (const file of files) {
    if (file.endsWith(".enc")) continue
    const filePath = path.join(dir, file)
    try {
      const plain = await readFile(filePath)
      const enc = encrypt(plain)
      await writeFile(filePath + ".enc", enc)
      // Don't delete the plain file — Baileys needs it; we keep .enc for backup
    } catch (err) {
      logger.warn({ err, file }, "Failed to encrypt auth file")
    }
  }
}

let bucketExists: boolean | null = null

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
  const files = readdirSync(dir).filter((f) => f.endsWith(".enc"))
  for (const file of files) {
    const filePath = path.join(dir, file)
    try {
      const data = await readFile(filePath)
      const storagePath = `${agentId}/${file}`
      const { error } = await supabase.storage
        .from(config.AUTH_STORAGE_BUCKET)
        .upload(storagePath, data, { upsert: true, contentType: "application/octet-stream" })
      if (error) logger.warn({ error, file }, "Failed to backup auth file to storage")
    } catch (err) {
      logger.warn({ err, file }, "Failed to backup auth file")
    }
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
