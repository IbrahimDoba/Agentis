import type { WAMessage, WASocket } from "@whiskeysockets/baileys"

/** Bare user part of a JID: "234803123:5@s.whatsapp.net" -> "234803123". */
export function bareUser(jid: string | null | undefined): string | null {
  if (!jid) return null
  return jid.split("@")[0].split(":")[0] || null
}

// Resolved once per socket: our identity can't change without a relink, and a
// relink builds a new socket. WeakMap so the entry dies with the socket.
const selfJidCache = new WeakMap<object, string[]>()

/**
 * Every JID form WhatsApp might address US by in a group.
 *
 * `sock.user.lid` is optional in Baileys and is NOT reliably populated, so
 * relying on it alone means a LID-addressed mention never matches and the bot
 * silently ignores everyone. Groups increasingly address members by LID, so we
 * also resolve our own LID through the same signalRepository mapping the send
 * path uses (see resolve-jid.ts) — the mapping for our own number is present in
 * the auth store once the session has synced.
 */
export async function resolveSelfJids(sock: WASocket): Promise<string[]> {
  const cached = selfJidCache.get(sock as unknown as object)
  if (cached) return cached

  const user = sock.user as { id?: string; lid?: string; phoneNumber?: string } | undefined
  const jids = [user?.id, user?.lid, user?.phoneNumber].filter((j): j is string => !!j)

  const pn = bareUser(user?.phoneNumber ?? user?.id)
  if (pn) {
    try {
      const lidStore = (sock as unknown as {
        signalRepository?: { lidMapping?: { getLIDForPN?: (pn: string) => Promise<string | null> } }
      }).signalRepository?.lidMapping
      const lid = await lidStore?.getLIDForPN?.(`${pn}@s.whatsapp.net`)
      if (lid) jids.push(lid)
    } catch {
      // Mapping unavailable — fall back to whatever sock.user gave us.
    }
  }

  // Only cache once we have something; an empty result during startup would
  // otherwise stick for the life of the socket and deafen the bot permanently.
  if (jids.length > 0) selfJidCache.set(sock as unknown as object, jids)
  return jids
}

// contextInfo hangs off whichever message variant carried it. A tag can arrive
// on a plain text message or as a caption on media, so check both.
function contextInfoOf(msg: WAMessage): Record<string, any> | null {
  const m = msg.message as any
  return (
    m?.extendedTextMessage?.contextInfo ??
    m?.imageMessage?.contextInfo ??
    m?.videoMessage?.contextInfo ??
    m?.documentMessage?.contextInfo ??
    m?.ephemeralMessage?.message?.extendedTextMessage?.contextInfo ??
    null
  )
}

/**
 * Was this group message addressed to us? True when we are in `mentionedJid`,
 * or when it quotes a message we sent.
 *
 * We match on the bare user part against every id we know ourselves by, because
 * WhatsApp addresses group members by phone JID or by privacy LID depending on
 * the group. Comparing full JIDs misses the LID form, and the bot then silently
 * never triggers.
 */
export function isAddressedToUs(
  msg: WAMessage,
  selfJids: (string | null | undefined)[],
  wasSentByUs: (msgId: string) => boolean
): boolean {
  const self = new Set(selfJids.map(bareUser).filter((u): u is string => u !== null))
  if (self.size === 0) return false

  const ctx = contextInfoOf(msg)
  if (!ctx) return false

  return matchesSelf(ctx, self, wasSentByUs)
}

/** The mention/quote fields a drop decision was based on, for diagnostics. */
export function addressingDebug(msg: WAMessage): Record<string, unknown> {
  const ctx = contextInfoOf(msg)
  return {
    mentionedJid: ctx?.mentionedJid ?? null,
    quotedStanzaId: ctx?.stanzaId ?? null,
    quotedParticipant: ctx?.participant ?? null,
  }
}

function matchesSelf(
  ctx: Record<string, any>,
  self: Set<string>,
  wasSentByUs: (msgId: string) => boolean
): boolean {
  const mentioned: string[] = Array.isArray(ctx.mentionedJid) ? ctx.mentionedJid : []
  for (const jid of mentioned) {
    const user = bareUser(jid)
    if (user && self.has(user)) return true
  }

  // A reply to one of our messages is an address even without an @mention.
  // stanzaId is the quoted message's id, which is what markSentByUs recorded.
  const quotedId: string | undefined = ctx.stanzaId
  if (quotedId && wasSentByUs(quotedId)) return true

  // Some clients populate the quoted author but not mentionedJid.
  const quotedAuthor = bareUser(ctx.participant)
  if (quotedAuthor && self.has(quotedAuthor)) return true

  return false
}
