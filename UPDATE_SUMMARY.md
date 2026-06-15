# Update Summary (Jun 2026)

Engineering changelog for the recent work on Agentis / D-Zero AI — the External
Developer API, the product-album + vision features, and the WhatsApp session
reliability fixes. Grouped by what shipped, what was diagnosed, and what's still
pending.

---

## ✅ Shipped & merged to `main`

### External Developer API
- **Messaging (Surface C)** — `POST /v1/messages` (send an outbound WhatsApp from a
  connected agent) and `POST /v1/contacts/check` (verify a number is on WhatsApp).
  New `messages` key scope. Sends go through the worker's anti-ban pipeline and bill
  per message via a new `api` billing source. *(PR #8)*
- **Docs** — the live `/developers` page now documents every surface with
  **cURL + JavaScript + Python** examples (language tabs), a "find your agent ID"
  section, and the errors table. Added **`/llms-api.txt`** — a machine-readable API
  reference for AI tools. *(PRs #11, #13)*
- **Host fix** — corrected the API base host in all docs from `app.dailzero.com`
  (which doesn't resolve — `ENOTFOUND`) to **`www.dailzero.com`**. *(PR #11)*

### Agent controls
- **Global "AI replies" master switch** — per-agent toggle; when off, the
  orchestrator skips the AI for *all* of that agent's conversations. *(PR #9)*
- **Auto-resume AI** — per-agent timer (Off / 30m / 1h / 2h / 4h); a worker sweep
  flips human-mode conversations idle past the threshold back to AI. *(PR #9)*
- **Copyable agent IDs** in the Developer tab (so developers can grab the `agentId`
  for API calls). *(PR #12)*

### Onboarding
- **3-step onboarding refactor** (personality → knowledge → connect) replacing the
  chat-scan auto-configure. *(PR #10)*

### Product album (the ad → "send me the pics" flow)
- **Send the catalogue as one WhatsApp album** when a customer asks to see products.
  Per-agent toggle + optional intro title under the product catalogue. The
  orchestrator gets a `send_product_catalog` tool (gated on the toggle); the worker
  sends a proper grouped album (parent + linked images) via the anti-ban pipeline,
  billed per image. *(PRs #14, #15)*
- **Accuracy fixes** — each album image is captioned with its product name so a
  customer who quote-replies ("tags") an image is mapped deterministically to the
  right product; plus a routing rule so **"show me everything" → album** but
  **"do you have X?" → just that one image** (and only if it's in the catalogue).
  *(PR #17)*

### Vision
- **The AI can now see inbound images** — a photo the customer sends, or one they
  quote-reply to. The worker downloads the image (direct or quoted) and forwards it;
  the orchestrator attaches it to the turn as multimodal content so `gpt-4o-mini`
  (already vision-capable) sees it. Billing is automatic via the existing per-token
  charge — no new credit type. *(PR #16)*

### Reliability
- **Session watchdog** — the worker previously *gave up* reconnecting after 10
  attempts and left a session `DISCONNECTED` until a human restarted it (this caused
  a ~16h dead window where every inbound was silently dropped). A 3-min sweep now
  auto-revives sessions stuck in `max_reconnect_attempts_exceeded`; `restart()`
  restores auth from the Supabase backup and reconnects — so they self-heal in
  minutes with no QR / manual action. *(PR #17)*

### Migrations added
- `aiRepliesEnabled`, `autoResumeAiAfterMinutes` on `Agent` (PR #9)
- `productAlbumEnabled`, `productAlbumTitle` on `Agent` (PR #15)
- *(plus `developerModeEnabled` on `User` from the prior developer-mode work)*

---

## 🔎 Incidents diagnosed

- **"Worker not picking up messages"** → the WhatsApp socket was a **zombie**
  (reported `CONNECTED` after a stream error but wasn't receiving). Fixed by
  restarting the session. Underlying instability is the recurring stream errors.
- **16-hour dead window** → root cause: the worker's reconnect cap
  (`MAX_RECONNECT_ATTEMPTS = 10`) → it gave up and waited for a manual restart.
  Fixed by the **watchdog** above.
- **Auth backup** → investigated and **ruled out** as a cause: the Supabase
  `baileys-auth-backups` bucket exists and holds per-agent auth, and sessions
  restore from it on redeploy.
- **"AI inconsistent" + "phantom unread" chats** → diagnosed as downstream of the
  **session instability + message replay on reconnect** (replayed messages get
  re-saved with fresh timestamps → duplicates + re-flag read chats as unread), plus
  a fragile in-memory `sent-message-cache` (60s TTL, wiped on restart) that can
  mis-flag the AI's own messages as operator replies → wrongly flips a chat to human
  → AI goes silent on it. The dashboard read/unread logic itself is correct.

---

## 🚀 Deploy notes

- **Vercel** auto-deploys the Next.js app + runs migrations on merge.
- **Worker (Railway)** must be **redeployed separately** for: the `api` send source,
  album billing, vision image download, captioned albums, and the **watchdog**.
- **Orchestrator (Railway)** must be **redeployed separately** for: the
  `send_product_catalog` tool, vision multimodal, and the album/single routing.

---

## ⏳ Pending / next steps

1. **Redeploy the worker and the orchestrator** so all the above is actually live
   (merge alone only ships the Next.js side).
2. **Message-handling hardening (NOT built yet)** — Redis-backed sent-message cache
   (longer TTL, survives restarts) + tighter dedup, to kill the replay duplicates,
   the phantom-unread re-flagging, and the wrong human-flips. Recommended only if
   those symptoms persist once the watchdog has stabilized the session.
3. **Railway log access** — setting up a Railway token so the worker/orchestrator
   logs can be read directly for debugging.

---

## ⚠️ Known watch-items

- The justfits WhatsApp session has been hitting **recurring stream errors**
  (`unknown`, `ack`, `restart required`) — partly WhatsApp-side, possibly aggravated
  by heavy media/album activity on the number. The watchdog turns these from
  multi-hour outages into ~minute blips, but doesn't stop the errors themselves.
- The repo `.gitignore` ignores `*.md`, so internal markdown docs (incl. this file)
  must be force-added to be tracked.
