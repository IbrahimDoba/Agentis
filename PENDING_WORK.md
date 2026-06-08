# Pending Work Log

## 🔜 Planned: Per-Agent Conversation Settings

Discussed 2026-05-07. Goal: move always-on behaviours (like the auto-pause-on-human-reply we just shipped) behind user-controllable toggles, with a clean home for future conversation-level settings to land.

### Placement decisions
- Settings live on the **Agent detail page** as a new "Settings" tab — alongside Profile / Configuration / Documents / Tools.
- The Conversations chat header gets a small ⚙ icon that deeplinks to `/dashboard/agent/<id>?tab=settings`. One-click from the work surface.
- Templates tab + Guide tab are being **removed from the agent detail page**. Guide moves to a standalone `/dashboard/guide` page accessible from the sidebar (next to "What's New").

### v1 implementation chunks

**1. Cleanup — remove Templates + Guide tabs**
- Drop both from the `TABS()` array in `src/app/dashboard/agent/[id]/page.tsx`.
- Remove `<TemplatesTab>` and `<AgentGuide>` rendering blocks + unused imports.
- Move `AgentGuide` function + `GUIDE_SECTIONS` constant out of the agent page.

**2. Move Guide → standalone page**
- New route `/dashboard/guide` rendering the existing accordion.
- Drop the now-irrelevant "Templates" section from `GUIDE_SECTIONS`.
- Add a "Guide" entry to the dashboard `Sidebar` nav (next to "What's New").

**3. New "Settings" tab on agent detail**
- New `AgentSettingsTab` component.
- v1 ships exactly one toggle: **"Auto-pause AI when I reply manually"** — default `ON` to preserve current behaviour.
- Description of what the toggle does, then a Save button → PATCH `/api/agents/[id]`.
- Agent detail page accepts `?tab=settings` query param so the deeplink lands on the right tab.

**4. Backend plumbing**
- Prisma migration: `Agent.autoPauseOnHumanReply Boolean @default(true)`.
- Update `agentSchema` in `src/lib/validations.ts` to accept the new field.
- Two enforcement sites must consult the flag before flipping `Conversation.mode` to "human":
  - `src/app/api/conversations/[id]/messages/route.ts` (dashboard human-send path).
  - Worker's `saveHumanOutboundMessage` in `worker/src/db/queries.ts` (phone-reply path) — needs a small SELECT for the flag.

**5. Deeplink ⚙ on Conversations**
- Small icon next to the agent name in the chats header → links to the Settings tab.

### Future toggles to add to the same panel (not v1)
- Greet new contacts automatically with a configurable message
- Default mode for new conversations (ai / human)
- Quiet hours / AI working hours (when to NOT respond)
- Auto-mark-as-read toggle
- Send typing indicator toggle
- Welcome / away messages
- Forward unhandled messages to email or SMS

---

## 🔜 Onboarding (added 2026-06-07)

### Bump the auto-configure time estimate: 5 min → 20 min
- The onboarding auto-configure screen tells users it "usually takes about **5 minutes**", but it actually runs longer. Update the copy to **20 minutes** so expectations match reality.
- File: `src/app/onboarding/auto-configure/AutoConfigureClient.tsx` (~line 217, the `subtitle` paragraph).
- ⚠️ The marketing "live in under 5 minutes" lines on `src/app/(marketing)/solutions/*` are a **separate** claim (about WhatsApp connection speed, not auto-configure) — leave those unless we deliberately want to revisit them.

### Optimize the onboarding
- Auto-configure is slow (the reason for the bump above). Reduce real time and/or perceived wait:
  - Profile the actual bottleneck first — WhatsApp history sync vs the LLM "learning how you reply" analysis.
  - Parallelize the history pull and the analysis instead of running them serially.
  - Stream/step progress (show concrete steps completing) instead of one long spinner.
  - Let the user enter the dashboard while it finishes in the background, then notify when ready.
  - Cap how many chats we pull on the first pass; deepen later.

---

## 🔜 More AI settings (added 2026-06-07)

Extends the per-agent settings panel (`AgentSettingsTab`) — the "add settings to the AI" idea is to keep moving behaviours behind user-controllable toggles (see the "Future toggles" list above).

### Auto-switch a conversation back to AI after a set time
- When a conversation is in **human** mode (manual takeover or AI handoff), automatically return it to **AI** mode after a configurable period of inactivity — e.g. a dropdown: Off / 30 min / 1 hr / 2 hr / 4 hr.
- **Why:** handed-off chats currently stay in human mode indefinitely; operators forget to hand back, so the AI stops covering. Auto-resume keeps the AI helping once the human is done.
- **Setting:** per-agent `autoResumeAiAfterMinutes` (Int?, null = off). Add to schema + `agentSchema` validation + the Settings tab UI.
- **Mechanism:** prefer a worker cron that periodically scans conversations where `mode = 'human'` and `lastActivityAt` (or `handoffAt`) is older than the threshold, and flips them back to `ai`. (Alternative: check-on-read, but a cron is more reliable.)
- **Ties into PR #6 (needs-human UI):** once a conversation auto-resumes to AI, `needsHumanNow()` returns false, so the "🚨 Needs human" badge clears automatically.
