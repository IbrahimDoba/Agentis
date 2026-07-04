# Session Handoff — 2026-07-04

Context dump so a fresh AI (new laptop) can pick up. Repo: `agentis/`. Prod = `main`
(Vercel auto-deploys). Worker = separate Railway service (manual redeploy).

---

## 🔴 DO THIS FIRST — redeploy the worker on Railway
`main` has several **worker** changes that only go live after a **Railway redeploy**
(pushing to GitHub is NOT enough). Until the worker is redeployed it runs OLD code, so:
- **Credit carryover is ignored on the AI send-gate** (users capped at base limit on sends).
- **The billing-window bug is still active on enforcement** (mid-cycle upgraders under-charged).
Worker files changed this session: `worker/src/billing/billing-period.ts`, `credits.ts`,
`worker/src/queue/outbound-queue.ts`, `worker/src/queue/followup-queue.ts`,
`worker/src/routes/followup.ts`, `worker/src/db/queries.ts`, `worker/src/billing/charge.ts`.
Also verify Vercel has deployed `main` @ `937b15d`.

---

## What shipped this session (all on `main`)

| Commit | What |
|---|---|
| (early) | **Draft-polish**: ✨ button in the chat composer that AI-rewrites the operator's draft. Costs **2 credits** (`CreditUsage.source="assist"`). Files: `src/lib/draftAssist.ts`, `POST /api/conversations/[id]/improve-draft`, `OrchestratorChatsView.tsx`. |
| (early) | **Worker `spreadHours`**: optional param on the follow-up `/start` route to compress a campaign (e.g. 2h). For the deferred 107-msg campaign restart (see TODO). |
| (early) | **Email fixes**: payment emails were misaligned (`infoRow` `<tr>` dropped in a `<div>` → foster-parented → collapsed layout). Wrapped in `<table>`. Removed ElevenLabs copy; reworded agent-review emails (onboarding is self-service now). |
| `97c2bfd` | **Free-trial** (built by another agent; I reviewed, closed a gap, merged). 7-day trial for platform free users; wall on expiry. I added the trial gate to the conversation-reply route. See memory `project_self_service_onboarding`. |
| `c51989d` | **Lead export** vCard + CSV buttons on the Chats tab (#66, shipped by user). |
| `f338b37` | **Removed the dead ElevenLabs view/tab** — `ChatsClient` is orchestrator-only now; dashboard runtime toggle gone; `ContactsView` + `ChatList` deleted (kept `ConversationDrawer`, used by LeadsClient). No DB deletions — ElevenLabs agent rows untouched. 4 EL agents still exist but their owners now see an empty Chats tab. |
| `2456f8e` | **Credit carryover** feature (see billing section). |
| `923884c` | Capped rollover at 25% on renewals + plan changes. |
| `b32fe0a` | **Corrected**: FULL carryover on plan change, 25% cap only on same-plan renewal. |
| `937b15d` | **Billing-window bug fix** (see below). |

Also saved (uncommitted, repo root): **`AI_AUTOMATION_IDEAS.md`** (product brainstorm — voice-agent revival, WhatsApp+voice omnichannel, AI accounts-receivable, Pidgin/local-language, etc.).

---

## Billing model now (important + subtle)
**Monthly plan allowance** is computed, not stored: `effectiveLimit − usage-in-billing-period`.
Billing period = `getBillingPeriod(subscriptionExpiresAt)` = a 30-day window ending at expiry.

**Credit rollover** (`src/lib/subscriptionBilling.ts` `applySubscriptionCharge`, helper in `src/lib/plans.ts`):
- **Plan change (upgrade/downgrade) → FULL unused** carries one cycle.
- **Same-plan renewal → capped at 25%** of plan base (Basic 6,250 / Starter 15,000 / Pro 25,000).
- One-cycle expiry; excludes free/reseller/enterprise (`PLAN_PRICES > 0` guard).
- Stored in `User.carryoverCredits` + `carryoverExpiresAt` (migration `20260702000000_add_credit_carryover`, **applied to prod**).
- `effectiveCreditLimit(base, carryover, expiry)` in `plans.ts` **AND `worker/src/billing/credits.ts` (mirror — keep in sync)**. Threaded into: worker `outbound-queue`, `charge.ts`, `apiBilling` (preflight/charge/remaining), `agentLimitCheck`, dashboard stats, `draftAssist`, admin billing.
- See memory `project_credit_rollover`.

**Billing-window bug (fixed `937b15d`):** `getBillingPeriod` used to return `[expiry−30d, expiry]` with no handling for `expiry > now+30d`. A mid-cycle upgrade *extends* the expiry, so the window landed entirely in the future → current usage never counted → **free AI usage**. Fix walks the 30-day window back until it contains `now`. Fixed in BOTH `src/lib/billing-period.ts` and `worker/src/billing/billing-period.ts`.

---

## ⚠️ Manual prod writes done this session (audit trail)
Client **`skavalainc@gmail.com`** (`User.id = cmqkfungx000004jlqcw2sow5`, agent `cmqkfz564000104jlo3265oel`) — the guinea pig for both billing bugs:
- `carryoverCredits`: 6,250 (buggy cap) → 12,234 (true unused) → **14,000** (goodwill, per user).
- `subscriptionExpiresAt` + `carryoverExpiresAt`: 2026-08-29 → **~2026-08-02** (reset to a clean cycle starting at his 2026-07-03 upgrade so only Starter usage counts).
- Result: 74,000 limit, ~2,020 used, ~72k left. Fair.
These were one-off support corrections, not code. No other users were affected by either bug (verified: he was the only one with a future billing window).

---

## Outstanding TODO
1. **Redeploy the worker on Railway** (see top). Highest priority.
2. **107-msg follow-up campaign restart** (`cmqrxfvhd…`) — deferred. `spreadHours` param shipped but never triggered. See memory `project_pending_followup_restart_107`.
3. Consider whether **upgrades should reset vs extend** the cycle (the extend behavior caused the billing-window bug; the window fix handles it either way, but it's worth a deliberate decision).
4. **AI automation roadmap** — pick a vertical + decide if voice is core/add-on, then pressure-test the flagship (WhatsApp+voice omnichannel). See `AI_AUTOMATION_IDEAS.md`.

---

## Working mechanics
- **Deploy to prod (Next.js):** push to `main` (`git push origin <branch>:main`; branch protection requires PRs but the owner's pushes bypass it). Vercel auto-deploys. Always `npm run build` first (it also runs `prisma migrate deploy` against **prod**).
- **Worker:** manual Railway redeploy. `npm run build` does NOT touch it.
- **Prod DB:** reads OK once authorized; **writes are blocked by default** and need explicit per-action authorization (the classifier denies them otherwise). Neon had intermittent P1001 outages during this session.
- **Branch churn:** the user switches branches often; ALWAYS check `git branch` + `git rev-list --count origin/main..HEAD` before committing/pushing. Current work landed on `main` via `feat/worker-event-log`.
- **Prisma:** after schema changes run `npx prisma generate && node scripts/patch-prisma.js` (provider is `prisma-client`, NOT `-js`). `src/generated/prisma` is gitignored.
- Relevant memories (auto-loaded): `project_credit_rollover`, `project_self_service_onboarding`, `project_worker_needs_railway_redeploy`, `project_billing_humans_free`, `project_pending_followup_restart_107`, `feedback_dont_push_without_testing`.
