// Pure helpers for saving chats into the phone's address book. Deliberately
// free of config/db imports so they stay unit-testable (see CLAUDE.md landmines).

// Raised from 500 after a Nov 2026 run saved 1,500 contacts over 3 days with 0
// failures at ~4.5s pacing. WhatsApp publishes no limit, so this is judgement,
// not a known safe number: if numbers start getting restricted, lower it first.
export const DAILY_SAVE_CAP = 1000
export const CREDITS_PER_CONTACT = 1

// Free (trial) accounts can save this many contacts in total, across all their
// agents. Paying accounts (a live subscription or a usable PAYG wallet) have no
// total limit, only the daily cap above.
export const FREE_SAVE_LIMIT = 200

// "Free" means nothing is paying: no live paid subscription and an empty or
// expired wallet. PAYG users keep plan "free", so the plan name alone isn't enough.
export function isFreeAccount(opts: { plan: string | null; subscriptionExpiresAt: string | Date | null; wallet: number; now?: number }): boolean {
  if (opts.wallet > 0) return false
  const lapsed = opts.subscriptionExpiresAt !== null && new Date(opts.subscriptionExpiresAt).getTime() <= (opts.now ?? Date.now())
  return (opts.plan ?? "free") === "free" || lapsed
}

// Saves left before the free limit; null when the account has no total limit.
export function freeSavesLeft(isFree: boolean, savedSoFar: number): number | null {
  return isFree ? Math.max(0, FREE_SAVE_LIMIT - savedSoFar) : null
}

// Nigerian and most international numbers. LIDs (14-15 digit privacy ids that
// sometimes land in Conversation.phoneNumber) are not dialable, so they're out.
export const SAVEABLE_PHONE = /^[0-9]{10,13}$/

// Push names are self-chosen and some aren't names at all: "🔥", ".", "H",
// "Typing......", or a bare number. Saving those just clutters the phone.
export function isJunkName(name: string | null | undefined): boolean {
  const t = (name ?? "").trim()
  if (!t) return true
  if ((t.match(/\p{L}/gu) ?? []).length < 2) return true
  if (/^typing/i.test(t)) return true
  return /^[+\d\s()-]+$/.test(t)
}

export function savedName(name: string, tag: string | null | undefined): string {
  const base = name.trim().replace(/\s+/g, " ").slice(0, 60)
  const suffix = tag?.trim()
  return suffix ? `${base} ${suffix}` : base
}

export function contactSaveArgs(phone: string, name: string, tag: string | null | undefined) {
  const jid = `${phone}@s.whatsapp.net`
  const fullName = savedName(name, tag)
  return {
    jid,
    contact: {
      fullName,
      firstName: fullName.split(" ")[0],
      pnJid: jid,
      // Without this the save stays inside WhatsApp and never reaches the phone's
      // Contacts app, which is what status privacy ("My contacts") reads.
      saveOnPrimaryAddressbook: true,
    },
  }
}

export interface AddressBookEntry {
  phone: string
  name: string
}

// contacts.upsert mixes address-book entries with history-sync chats. Only an
// address-book entry carries `name` (the name the OWNER saved); `notify` is the
// customer's own push name and must not count as "saved".
export function addressBookEntries(
  contacts: unknown[],
  resolvePhone: (jid: string) => string,
): AddressBookEntry[] {
  const out = new Map<string, string>()
  for (const c of contacts) {
    const contact = c as Record<string, string | undefined>
    const name = contact.name?.trim()
    if (!name || !contact.id) continue
    const pnJid = contact.id.endsWith("@lid") ? contact.phoneNumber : contact.id
    const phone = (pnJid ? pnJid.split("@")[0].split(":")[0] : resolvePhone(contact.id)).replace(/\D/g, "")
    if (SAVEABLE_PHONE.test(phone)) out.set(phone, name)
  }
  return [...out].map(([phone, name]) => ({ phone, name }))
}

// The daily cap rolls over at midnight Lagos time (UTC+1, no DST), where every
// current customer is. Returns the counter's day key and when that day ends.
export function capDay(now: number): { key: string; endsAt: number } {
  const lagos = new Date(now + 60 * 60 * 1000)
  const key = lagos.toISOString().slice(0, 10)
  const endsAt = Date.UTC(lagos.getUTCFullYear(), lagos.getUTCMonth(), lagos.getUTCDate() + 1) - 60 * 60 * 1000
  return { key, endsAt }
}
