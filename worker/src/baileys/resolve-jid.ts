import type { WASocket } from "@whiskeysockets/baileys"

// Resolve the JID we should actually send to. WhatsApp increasingly addresses
// contacts by privacy LID (@lid). Sending to the phone JID (@s.whatsapp.net)
// for a LID-migrated contact SILENTLY FAILS — sendMessage returns an id (so the
// caller marks it "sent") but nothing is delivered. AI replies work because
// they reply to the inbound LID directly; broadcasts/follow-ups constructed a
// phone JID instead, which is why they showed "sent" with nothing arriving.
//
// getLIDForPN resolves the contact's LID from the local mapping or fetches it
// from WhatsApp (USync) when unknown, so it works for existing contacts — not
// just ones who've messaged since this deployed. Returns null when the number
// isn't on WhatsApp at all.
export async function resolveSendJid(sock: WASocket | null, toJid: string): Promise<string | null> {
  if (!sock) return null
  // Already LID-addressed — send as-is.
  if (toJid.endsWith("@lid")) return toJid

  // Group JIDs are fully-qualified already and are never LID-migrated. Without
  // this they fall into the >=15-digit branch below (a group id is ~18 digits)
  // and get rewritten to `<id>@lid`, so the send silently misdelivers.
  if (toJid.endsWith("@g.us")) return toJid

  // A 15+ digit "number" is really an unresolved LID stored with the wrong
  // suffix — follow-ups/scanned contacts save `<id>@s.whatsapp.net` even when
  // <id> is a LID. Real phone numbers are <= 13 digits in practice, so route
  // these as @lid (the address AI replies use). Without this, getLIDForPN below
  // can't resolve a LID-as-phone and the contact is wrongly marked unreachable.
  const user = toJid.replace(/@.*$/, "").replace(/\D/g, "")
  if (user.length >= 15) return `${user}@lid`

  try {
    const lidStore = (sock as unknown as {
      signalRepository?: { lidMapping?: { getLIDForPN?: (pn: string) => Promise<string | null> } }
    }).signalRepository?.lidMapping
    const lid = await lidStore?.getLIDForPN?.(toJid)
    if (lid && lid.endsWith("@lid")) return lid
  } catch {
    // fall through to phone-JID verification
  }

  // Not LID-migrated (or mapping unavailable) — verify the number is on
  // WhatsApp and send to the phone JID.
  try {
    const checks = (await sock.onWhatsApp(toJid)) ?? []
    const match = checks.find((item) => item?.exists)
    return match ? (match.jid || toJid) : null
  } catch {
    return null
  }
}
