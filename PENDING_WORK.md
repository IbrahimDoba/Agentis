# Pending Work Log

## ✅ Completed & Pushed

- Onboarding: brand name "Agentis" → "D-Zero AI"
- Onboarding: removed "team reviews within 24 hours" from step 5
- Onboarding: saves goals to new `businessGoals` DB field (migration included)
- Agent detail page: added "Guide" tab with collapsible accordion explaining all tabs + step-by-step agent setup guide
- Credits: human operator messages now charge credits (5/text, 8/image) same as AI
- Credits: billing limit enforcement still AI-only (operators always go through)
- Credits: billing page now shows AI vs Team credit breakdown
- Worker: daily message count display now reads from Redis (source of truth)
- All pushed to GitHub. Migration runs automatically on next deploy.

---

## ✅ Completed Locally — Ready to Commit/Push

### Basic Plan (₦30,000 / 25,000 credits):

1. **`src/lib/plans.ts`** — Added `basic` to:
   - `PLAN_PRICES` (30000)
   - `PLAN_CREDIT_LIMITS` (25000)
   - `PLAN_OVERAGE_RATE_PER_1K` (null — no overage)
   - `PLAN_LABELS` ("Basic")
   - `PLAN_FEATURES` (list of features)
   - `PLAN_ORDER` (between free and starter)
   - `PLAN_SEAT_LIMITS` (1)

2. **`worker/src/billing/credits.ts`** — Added `basic: 25000` to `PLAN_CREDIT_LIMITS`

3. **`src/app/api/subscription/request/route.ts`** — Added `"basic"` to the zod enum

4. **`src/components/admin/AdminPaymentsTable.tsx`** — Added `basic: "#0f766e"` color

5. **`src/app/(marketing)/pricing/page.tsx`** — Added `basicMonthly` + `basicFeatures`, then completed:
   - Basic plan card in the plans grid
   - Comparison table Basic column
   - FAQ updates to mention Basic plan behavior

6. **`src/app/(marketing)/pricing/page.module.css`** — Updated comparison table grid from 3 columns to 4 columns for Feature + Basic + Starter + Pro

7. **`src/app/dashboard/subscription/page.tsx`** — Added `basic: false` to `PLAN_POPULAR`

8. **Validation** — ESLint passed on touched pricing/subscription files

### Remaining TODO:

1. **Commit & push** all Basic-plan related changes together

---

## 📋 Other Things to Consider (not discussed yet)

- Media display in conversation view (mentioned but deferred)
- Credits for inbound customer messages (decided: not applicable)
