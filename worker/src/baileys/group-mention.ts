import type { WAMessage } from "@whiskeysockets/baileys"

/** Bare user part of a JID: "234803123:5@s.whatsapp.net" -> "234803123". */
export function bareUser(jid: string | null | undefined): string | null {
  if (!jid) return null
  return jid.split("@")[0].split(":")[0] || null
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
