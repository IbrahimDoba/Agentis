// Phone-number helpers shared by anything that addresses a WhatsApp send.
// Pure — no db/server imports — so both server code and tests can use it.

// Digits-only form of a number, for addressing a send and for keying a
// conversation. Numbers reach us as free text ("+234 802 792 9743" from the
// appointment form, the profile's notify number), and the worker turns a `to`
// that isn't already a JID straight into `<value>@s.whatsapp.net` — so anything
// but digits yields a malformed JID that can never deliver. Keying on the
// normalized value also keeps one customer on one conversation however their
// number was typed.
export function normalizePhone(value?: string | null): string {
  return (value ?? "").replace(/\D/g, "")
}
