# Cold outreach

A 200-prospect email pilot for one vertical. Cold contact happens over email
only; WhatsApp is where replies land, never where outreach starts.

## Why WhatsApp is not a cold channel here

Meta's Business Messaging Policy requires prior opt-in, and this product refuses
cold WhatsApp by design: `resolveBroadcastRecipients` drops any number with no
prior conversation, `anti-ban/rate-limiter.ts` caps new contacts at 50/day, and
`guide-content.ts` tells customers in writing that mass cold outreach gets their
number banned. Building the thing we tell customers not to do is not on the
table. Every email CTA points at a demo or a `wa.me` link instead.

## Setup

Cold mail is sent over **Zoho SMTP from `ibrahimdoba@dailzero.com`** — the root
domain, deliberately, and behind an explicit opt-in flag.

| Variable | Purpose |
|---|---|
| `OUTREACH_TRANSPORT` | `zoho-smtp` or `resend`. Defaults to `resend`. |
| `OUTREACH_FROM_EMAIL` | Sender. A real, monitored mailbox — `noreply@` is refused. |
| `OUTREACH_ALLOW_ROOT_DOMAIN` | Must be exactly `true` to send from `dailzero.com` itself. |
| `OUTREACH_FROM_NAME` | Display name. A person's name, not a brand. |
| `OUTREACH_REPLY_TO` | Defaults to `OUTREACH_FROM_EMAIL`. |
| `OUTREACH_SMTP_HOST` | `smtppro.zoho.com` — note `pro`, paid custom-domain accounts do not use `smtp.zoho.com`. Region-specific (`.eu`, `.in`). |
| `OUTREACH_SMTP_PORT` | `587` (STARTTLS) or `465` (implicit TLS). |
| `OUTREACH_SMTP_USER` | Same as the from address. |
| `OUTREACH_SMTP_PASSWORD` | **App-specific password.** Zoho enforces 2FA, so a normal password will not authenticate. Generate at `accounts.zoho.com` → Security → App Passwords. |
| `OUTREACH_DAILY_CAP` | Default 30. Set to **10** on the root domain. |
| `OUTREACH_HOURLY_CAP` | Default 5. Matches Zoho's rolling hourly window. |
| `OUTREACH_SLICE_SIZE` | Messages released per cron tick. Default 3. |
| `OUTREACH_WARMUP_STARTED_AT` | `YYYY-MM-DD`. Unset holds the cap at the day-one value. |
| `OUTREACH_UNSUB_SECRET` | Signs newsletter unsubscribe tokens. Falls back to `NEXTAUTH_SECRET`. |
| `OUTREACH_DEMO_OWNER_EMAIL` | Owner account for demo agents. |
| `CRON_SECRET` | Guards `/api/cron/outreach`. Must be set in Dokploy. |
| `RESEND_WEBHOOK_SECRET` | Only used on the `resend` transport. |

### Why sending from the root is a real tradeoff

`src/lib/email.ts` sends all 26 transactional templates from
`noreply@dailzero.com`, including the verification code a user cannot complete
signup without — and that code expires in 10 minutes. Cold mail routinely runs
0.5-1% complaints against an enforced 0.3% ceiling, and spam-foldering is silent:
nothing bounces, signups just quietly stop completing.

Transactional mail goes out through Resend on `send.dailzero.com` with its own IP
reputation, so **IPs stay separate**. But it DKIM-signs as `d=dailzero.com`, and
so does Zoho, so **domain reputation is shared**. Gmail weighs domain reputation
heavily.

This was an accepted decision, not an oversight. `OUTREACH_ALLOW_ROOT_DOMAIN`
exists so it stays a deliberate one: without the flag the guard refuses the root,
and a future deploy cannot drift into it silently.

Zoho separately forbids bulk cold email in its usage policy, with automated
enforcement on volume spikes, undeliverables and complaints.

### The controls that remain

With no separate domain to absorb damage, these are load-bearing:

1. **Low caps** — 10/day, 5/hour, released 3 at a time with 30-90s gaps.
2. **Google Postmaster Tools** — SMTP has no complaint feedback loop, so the
   halt-on-complaint breaker has no input. Postmaster Tools gives domain
   reputation and spam rate for `dailzero.com` directly from Google. It needs
   DMARC, which is live at `_dmarc.dailzero.com` (`p=none`). **Check it before
   scaling past the first 30.**
3. **Bounces halt everything** — on the SMTP transport, the first hard bounce
   pauses the campaign, because it is nearly the only automated signal left.
   List quality is the main thing under your control.

### DNS, already in place

| Record | Value |
|---|---|
| MX | `mx.zoho.com`, `mx2`, `mx3` |
| SPF | `v=spf1 include:zohomail.com ~all` |
| Zoho DKIM | `zmail._domainkey.dailzero.com` |
| Resend DKIM | `resend._domainkey.dailzero.com` |
| Resend Return-Path | `send.dailzero.com` |
| DMARC | `v=DMARC1; p=none; rua=mailto:admin@dailzero.com` |

Resend uses `send.dailzero.com` as its envelope domain, which is why it never
needed to be in the root SPF and why the two providers coexist. **Never add a
second SPF TXT record** — multiple SPF records are invalid and break mail for the
whole domain.

Move DMARC to `p=quarantine` after two weeks of clean aggregate reports.

## Running the pilot

1. `POST /api/admin/outreach/demo-owner` once, to create the demo owner account.
2. `POST /api/admin/outreach/import` with `{ csv, vertical }`. Columns (headers
   are matched case- and punctuation-insensitively): `businessName`, `email`,
   `sourceLabel`, `sourceUrl` are **required**; `contactName`, `city`, `phone`,
   `whatsapp`, `website`, `instagram`, `reviewCount`, `branchCount`,
   `hasPriceList`, `sellsInDms` are optional and feed the fit score.
3. Add `research.seed` to each prospect (the demo agent's configuration), then
   `POST /api/admin/outreach/generate` to provision the mirror demos.
4. Write the copy. Two paths, same `OutreachMessage` rows:
   - **Claude Code (the pilot path).** `GET /api/admin/outreach/drafts` returns
     the prospects still needing copy. A session with web access researches each
     business from its own site and socials, then `POST`s drafts back. No API
     key, no model bill, and the research step is real rather than stubbed.
   - **`personalize.ts` (the scale path).** Calls `claude-opus-5` server-side.
     Right shape above a few hundred prospects; needs `ANTHROPIC_API_KEY`.
5. Review every draft at `/admin/outreach`.
6. Sending drips from `/api/cron/outreach?job=send` every 10 minutes via a
   **Dokploy Schedule**. The admin button releases the next slice early; it
   cannot flush the day's allowance.

Drafts from either path run the same `validate.ts` gates — copy typed by a human
fails for an uncited claim exactly as model output does.

Sourcing is deliberately a spreadsheet, not a scraper. Instagram's terms forbid
automated collection, and Google Places reprices a search to $40 per 1,000 calls
once reviews are requested. Automate it after the message is proven, not before.

## Scheduling (Dokploy, not Vercel)

Prod runs on Dokploy. The `crons` array in `vercel.json` does not fire, so these
must be created as **Dokploy Schedules** or sending silently never happens.

| Schedule | Cron | Command |
|---|---|---|
| Outreach send | `*/10 * * * *` | `curl -fsS -H "Authorization: Bearer $CRON_SECRET" "https://www.dailzero.com/api/cron/outreach?job=send"` |
| Demo expiry | `0 * * * *` | `curl -fsS -H "Authorization: Bearer $CRON_SECRET" "https://www.dailzero.com/api/cron/outreach?job=demos"` |

`CRON_SECRET` must exist in the Dokploy environment; the route refuses to run
without it rather than defaulting to open.

Verify a schedule is actually firing by watching one run — Dokploy keeps only
about 20 minutes of logs, so check soon after it fires. The send job returns
`sentToday`, `sentLastHour` and the warmup state in its JSON response, so a
successful tick is obvious from the body alone.

To check configuration without sending anything, `GET /api/admin/outreach/send`
as an admin returns the caps, warmup state and deliverability health. A
misconfigured transport names the missing variable.

## Guardrails

- `assertSendable()` in `suppression.ts` is the only door into the send path. It
  runs at import, before generation, and again inside the send. It also blocks
  existing `User` and `NewsletterSubscriber` addresses.
- `validate.ts` rejects generated copy that runs long, flatters, uses a banned
  opener, carries an em dash, links anywhere but the demo, or cites a page we
  never fetched. Failures reach the review queue as fixable items.
- `/api/admin/outreach/send` refuses to run while any complaint is on record.
  At pilot volume one complaint is already above the enforced rate.
- Demo agents have `messagingEnabled: false` and expire after 21 days, which is
  what makes the follow-up's "your demo closes Friday" true.

## NDPA

Business contact details are personal data under the NDPA, and the GTCO ruling
found no lawful basis for marketing to a non-customer. Hence: business addresses
only, `sourceLabel`/`sourceUrl` required per row and disclosed in every email,
one-click unsubscribe honoured with no confirmation step, and erasure that hard-
deletes the prospect while keeping only a `sha256(email)` suppression row, so
the person can never be re-sourced and we retain nothing about them.
