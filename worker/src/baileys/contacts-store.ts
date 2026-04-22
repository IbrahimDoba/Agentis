/**
 * LID → phone number resolution.
 * WhatsApp uses privacy-preserving LIDs (@lid domain) for contacts.
 * We build the mapping from contacts.upsert / contacts.update events
 * and persist it to disk so it survives restarts.
 */

import { readFileSync, writeFileSync, mkdirSync } from "fs"
import path from "path"
import { logger as rootLogger } from "../lib/logger.js"

const AUTH_BASE = path.resolve("auth_sessions")
const logger = rootLogger.child({ module: "contacts-store" })

// In-memory cache: agentId → Map<lid, phoneNumber>
const cache = new Map<string, Map<string, string>>()

function agentCache(agentId: string): Map<string, string> {
  if (!cache.has(agentId)) cache.set(agentId, new Map())
  return cache.get(agentId)!
}

function lidMappingPath(agentId: string, lid: string): string {
  return path.join(AUTH_BASE, agentId, `lid-mapping-${lid}_reverse.json`)
}

function saveLidMapping(agentId: string, lid: string, phone: string): void {
  try {
    const dir = path.join(AUTH_BASE, agentId)
    mkdirSync(dir, { recursive: true })
    writeFileSync(lidMappingPath(agentId, lid), JSON.stringify(phone))
    agentCache(agentId).set(lid, phone)
  } catch (err) {
    logger.warn({ err, agentId, lid }, "Failed to save LID mapping")
  }
}

function loadLidMapping(agentId: string, lid: string): string | null {
  // Check memory cache first
  const mem = agentCache(agentId).get(lid)
  if (mem) return mem

  // Try disk
  try {
    const content = readFileSync(lidMappingPath(agentId, lid), "utf8").trim()
    const phone = JSON.parse(content) as string
    agentCache(agentId).set(lid, phone)
    return phone
  } catch {
    return null
  }
}

/**
 * Resolve a JID to a plain phone number string.
 * - @s.whatsapp.net JIDs → strip domain + device suffix
 * - @lid JIDs → look up saved mapping, fall back to LID digits
 */
// Optional: pass the socket's lidMapping store for live resolution
let lidMappingStore: { getPNForLID?: (lid: string) => string | undefined } | null = null

export function setLidMappingStore(store: typeof lidMappingStore): void {
  lidMappingStore = store
}

export function resolvePhone(agentId: string, jid: string): string {
  const [user, domain] = jid.split("@")

  if (!domain || domain === "s.whatsapp.net") {
    return user.split(":")[0]
  }

  if (domain === "lid") {
    const lid = user.split(":")[0]
    // 1. Try live socket store (most up-to-date)
    const livePN = lidMappingStore?.getPNForLID?.(lid + "@lid") ?? lidMappingStore?.getPNForLID?.(lid)
    if (livePN) return livePN.split("@")[0].split(":")[0]
    // 2. Try disk cache
    const phone = loadLidMapping(agentId, lid)
    if (phone) return phone
    return lid
  }

  return user.split(":")[0]
}

/**
 * Called on contacts.upsert and contacts.update events.
 * Extracts LID → phone mappings and persists them.
 */
export function updateContacts(agentId: string, contacts: unknown[]): void {
  for (const c of contacts) {
    const contact = c as Record<string, string | undefined>
    const id = contact.id ?? ""

    if (id.endsWith("@lid")) {
      // Since Baileys 6.8.0: when id is a LID, phoneNumber field holds the real PN
      const phone = contact.phoneNumber?.replace(/\D/g, "")
      const lid = id.split("@")[0].split(":")[0]
      if (phone && lid) {
        saveLidMapping(agentId, lid, phone)
        logger.debug({ agentId, lid, phone }, "Saved LID→phone mapping")
      }
    } else if (contact.lid) {
      // Older format: id is PN JID, lid field holds the LID JID
      const phone = id.split("@")[0].split(":")[0]
      const lid = contact.lid.split("@")[0].split(":")[0]
      if (phone && lid) {
        saveLidMapping(agentId, lid, phone)
        logger.debug({ agentId, lid, phone }, "Saved LID→phone mapping (legacy)")
      }
    }
  }
}
