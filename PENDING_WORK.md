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
