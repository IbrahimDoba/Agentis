# WhatsApp group chats — implementation plan

Let the AI participate in WhatsApp **group** chats: silent by default, replying
only when directly addressed. Optionally, seed topics into a group on a paced
schedule.

Status: **plan only, nothing implemented.**

Scope split, deliberately:

- **Phase 1 — reactive.** Ingest groups, reply only on mention or reply-to-us.
  Low ban risk (we only speak when spoken to). Ship this alone.
- **Phase 2 — proactive.** Operator-defined topics posted into a group on a
  schedule. Materially higher ban risk. Separate decision, separate release.

---

## 1. Why this isn't a small change

Groups are dropped at the very first hop, and the pipeline below that point
assumes one human per conversation.

### 1.1 Groups are filtered at ingest

`worker/src/baileys/event-handlers.ts:93-95`

```ts
// §9 — Ignore broadcasts and groups
if (msg.key.remoteJid?.endsWith("@broadcast")) continue
if (msg.key.remoteJid?.endsWith("@g.us")) continue
```

Same filter in `history-sync.ts:178` and `chat-extractor.ts:48` (the latter also
excludes `@g.us` in SQL). This is a deliberate rule. It becomes **conditional**,
never deleted — an agent without the flag must keep behaving exactly as today.

### 1.2 `resolveSendJid` corrupts group JIDs (live bug)

`worker/src/baileys/resolve-jid.ts:23`

```ts
const user = toJid.replace(/@.*$/, "").replace(/\D/g, "")
if (user.length >= 15) return `${user}@lid`
```

A group JID is `120363043211234567@g.us` — 18 digits. It hits the
unresolved-LID branch and is rewritten to `...@lid`, so the send silently
misdelivers: `sendMessage` returns an id, we mark it sent, nothing arrives.
Exactly the failure the file's own header warns about.

This is worth fixing on its own merits, independent of this feature.

### 1.3 The data model is 1:1

- `Conversation` is `@@unique([agentId, phoneNumber])` and the pipeline keys on
  `phoneNumber` throughout.
- `Message` has **no per-sender attribution**. `senderRole` is only
  `"ai" | "human"` and applies to outbound.

Without attribution the model receives a group thread as an undifferentiated
wall of text and cannot tell who said what. That is worse than no context: it
will confidently misattribute statements between participants.

---

## 2. What already exists and should be reused

Not scaffolding to build — this is all in place:

| Need | Existing mechanism |
|---|---|
| Reply gates | `generateReply` gate chain, `handle-inbound.ts:274+` |
| "Did they reply to us" | `wasSentByUs(msgId)`, `baileys/sent-message-cache.ts` |
| Quoted-message context | `event-handlers.ts:172-178`, already prepends `[Replying to: "…"]` |
| Burst coalescing | `replyDelaySeconds` debounce + seq token |
| Non-1:1 channel precedent | `channel: "embed"` threads through the whole pipeline |
| Group-addressable sends | `routes/messages.ts:38` already accepts a raw JID |
| Paced sending | `anti-ban/pacing.ts`, `warmup.ts`, `rate-limiter.ts` |
| Campaign targeting by JID | `BroadcastRecipient.jid` |

The `channel === "embed"` precedent is the important one. It proves the pipeline
already tolerates a non-phone-keyed conversation type, and it shows the idiom to
follow: a channel discriminator threaded through, with WhatsApp-only steps
guarded by `channel === "whatsapp"`.

---

# Phase 1 — reactive groups

## 3. Schema

One migration, fully additive. No backfill, no column drops.

`prisma/migrations/20260825000000_add_group_chat_support/migration.sql`

```sql
-- Per-message sender attribution. Null for every existing row and for all 1:1
-- traffic — only group inbound populates these.
ALTER TABLE "Message" ADD COLUMN "senderJid" TEXT;
ALTER TABLE "Message" ADD COLUMN "senderName" TEXT;

-- Per-agent opt-in. Groups stay dropped at ingest unless this is on.
ALTER TABLE "Agent" ADD COLUMN "groupChatEnabled" BOOLEAN NOT NULL DEFAULT false;

-- Per-group control. A row exists once the agent has seen the group.
CREATE TABLE "GroupChat" (
  "id"             TEXT NOT NULL,
  "agentId"        TEXT NOT NULL,
  "groupJid"       TEXT NOT NULL,
  "subject"        TEXT,
  "conversationId" TEXT,
  "replyMode"      TEXT NOT NULL DEFAULT 'mention',  -- 'mention' | 'off'
  "joinedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastMessageAt"  TIMESTAMP(3),
  CONSTRAINT "GroupChat_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "GroupChat_agentId_groupJid_key" ON "GroupChat"("agentId", "groupJid");
CREATE INDEX "GroupChat_agentId_idx" ON "GroupChat"("agentId");

ALTER TABLE "GroupChat" ADD CONSTRAINT "GroupChat_agentId_fkey"
  FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GroupChat" ADD CONSTRAINT "GroupChat_conversationId_fkey"
  FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
```

Prisma models:

```prisma
model GroupChat {
  id             String        @id @default(cuid())
  agentId        String
  agent          Agent         @relation(fields: [agentId], references: [id], onDelete: Cascade)
  groupJid       String
  subject        String?
  conversationId String?
  conversation   Conversation? @relation(fields: [conversationId], references: [id], onDelete: SetNull)
  // 'mention' = reply only when addressed; 'off' = ingest and log, never reply.
  replyMode      String        @default("mention")
  joinedAt       DateTime      @default(now())
  lastMessageAt  DateTime?

  @@unique([agentId, groupJid])
  @@index([agentId])
}
```

**Why the group reuses `Conversation` rather than getting its own thread table:**
every downstream consumer (dashboard thread view, `insertMessage`, summaries,
SSE, credit charging) already reads `Conversation`. Forking that would mean
touching all of them. The group is stored as a `Conversation` with:

- `phoneNumber` = the group JID (satisfies `@@unique([agentId, phoneNumber])`)
- `senderJid` = the group JID
- `channel` = `"whatsapp_group"`
- `contactName` = the group subject

Putting a JID in a column called `phoneNumber` is not pretty. It is still the
right trade: the alternative is a parallel thread model and a second code path
through every consumer. The `channel` discriminator is what code should branch
on — never a pattern-match on `phoneNumber`.

## 4. Worker changes

### 4.1 Fix the JID bug first

`worker/src/baileys/resolve-jid.ts`, before the digit-length check:

```ts
// Group JIDs are already fully-qualified and are never LID-migrated. Without
// this they fall into the >=15-digit branch below (a group id is ~18 digits)
// and get rewritten to @lid, which silently misdelivers.
if (toJid.endsWith("@g.us")) return toJid
```

Land this as its own commit. It is a delivery-correctness fix, not a feature.

### 4.2 Mention detection

New file `worker/src/baileys/group-mention.ts`, pure and unit-tested:

```ts
import type { WAMessage } from "@whiskeysockets/baileys"

/** Bare user part of a JID: "1234:5@s.whatsapp.net" -> "1234". */
function bareUser(jid: string | undefined | null): string | null {
  if (!jid) return null
  return jid.split("@")[0].split(":")[0] || null
}

/**
 * Was this group message addressed to us? True when we're in mentionedJid, or
 * when it quotes a message we sent.
 *
 * Our own identity can surface as either a phone JID or a LID depending on the
 * group, so match on the bare user part against every id we know ourselves by —
 * comparing full JIDs misses the LID form and the bot then never triggers.
 */
export function isAddressedToUs(
  msg: WAMessage,
  selfJids: (string | null | undefined)[],
  wasSentByUs: (msgId: string) => boolean
): boolean {
  const ctx = (msg.message as any)?.extendedTextMessage?.contextInfo
    ?? (msg.message as any)?.imageMessage?.contextInfo
    ?? null

  const self = new Set(selfJids.map(bareUser).filter(Boolean) as string[])

  const mentioned: string[] = ctx?.mentionedJid ?? []
  if (mentioned.some((jid) => { const u = bareUser(jid); return u !== null && self.has(u) })) return true

  // Replying to one of our messages counts as addressing us. stanzaId is the
  // id of the quoted message, which is what markSentByUs recorded when we sent it.
  const quotedId: string | undefined = ctx?.stanzaId
  if (quotedId && wasSentByUs(quotedId)) return true

  // Fallback for clients that populate participant but not mentionedJid.
  const quotedParticipant = bareUser(ctx?.participant)
  if (quotedParticipant && self.has(quotedParticipant)) return true

  return false
}
```

Tests (`group-mention.test.ts`) must cover: mention by phone JID, mention by LID,
quoted-reply to our message, quoted-reply to someone else's message, a message
mentioning a different participant, and a plain message with no contextInfo.

### 4.3 Ingest

In `event-handlers.ts`, replace the unconditional group skip:

```ts
if (msg.key.remoteJid?.endsWith("@broadcast")) continue

const isGroup = msg.key.remoteJid?.endsWith("@g.us") ?? false
if (isGroup && !(await isGroupChatEnabled(agentId))) continue
```

`isGroupChatEnabled` goes in `worker/src/db/queries.ts` alongside
`getConversationMode`, and must be cached (a per-message DB round trip on a busy
group is not acceptable) — a 60s TTL map keyed by agentId is enough.

Then, for group messages, derive the participant rather than the chat:

```ts
// In a group, remoteJid is the GROUP and key.participant is the human who
// spoke. The 1:1 path conflates the two; here they must stay distinct or every
// participant collapses into one identity.
const groupJid = isGroup ? msg.key.remoteJid! : null
const participantJid = isGroup
  ? ((msg.key as Record<string, unknown>).participantAlt as string | undefined) ?? msg.key.participant ?? null
  : null
```

Then, still inside the group branch and **before** any orchestrator forward:

```ts
if (isGroup) {
  const addressed = isAddressedToUs(msg, [sock.user?.id, sock.user?.lid], wasSentByUs)
  await recordGroupActivity(agentId, groupJid!, msg.pushName ?? null)
  if (!addressed) continue   // logged as activity, never forwarded, never billed
}
```

Dropping unaddressed messages **here** rather than in the orchestrator is
deliberate: it keeps unaddressed group chatter out of the queue, out of the DB,
and off the credit meter entirely. A busy group would otherwise generate
thousands of billable no-op inbound rows.

Trade-off to accept knowingly: the AI sees only the messages that address it,
not the surrounding conversation. Threading full group history into context is a
Phase 3 concern, and it multiplies both token cost and misattribution risk.

`forwardToOrchestrator` gains three optional fields:

```ts
channel?: "whatsapp_group"
groupJid?: string
senderName?: string
```

`fromPhone` carries the **group JID** (it is the conversation key), while
`senderJid`/`senderName` carry the participant.

### 4.4 Read receipts and typing

`sock.readMessages` and presence updates in a group are visible to every member.
Only mark read / show typing on messages we are actually going to answer,
otherwise the bot reads as a lurker watching the whole group.

## 5. Orchestrator changes

### 5.1 Channel

Extend the enum in `routes/inbound.ts`:

```ts
channel: z.enum(["whatsapp", "embed", "whatsapp_group"]).optional(),
groupJid: z.string().optional(),
senderName: z.string().optional(),
```

Then audit **every** `channel === "whatsapp"` guard in `handle-inbound.ts`. Each
is a decision, not a mechanical find-and-replace:

| Site | Group behaviour | Why |
|---|---|---|
| `senderJid` storage (l.117) | include | needed for label matching |
| debounce (l.168) | **include** | several people talk at once; coalescing matters more here than in 1:1 |
| background tagging (l.258) | exclude | tags are a 1:1 CRM concept |
| AI-off label check (l.291) | include | operators will expect labels to work |
| dispatch path | include | goes out over Baileys like any WhatsApp message |

### 5.2 Persist attribution

`insertMessage` takes `senderJid` / `senderName` and writes them for inbound
group rows.

### 5.3 Prompt shaping

Group turns need explicit framing, or the model answers as though in a DM:

```ts
// The model must know it's in a group, who addressed it, and that everything
// it writes is public to the whole group. Without this it produces 1:1-shaped
// replies — over-familiar, over-long, and addressed to nobody in particular.
if (channel === "whatsapp_group") {
  systemPrompt += [
    "",
    `You are in a WhatsApp group chat ("${groupSubject}"), not a private conversation.`,
    `${senderName ?? "Someone"} addressed you directly. Reply to them.`,
    "Everyone in the group sees your reply. Keep it short and on-topic.",
    "Do not greet the group, do not summarise the conversation, do not address anyone who did not ask you something.",
  ].join("\n")
}
```

### 5.4 Reply gate

Inside `generateReply`, after the existing `conversation.mode === "human"` check:

```ts
if (channel === "whatsapp_group") {
  const group = await getGroupChat(agentId, conversation.phoneNumber)
  if (!group || group.replyMode === "off") {
    logger.info({ agentId, conversationId }, "Group reply mode off — skipping")
    return
  }
}
```

The worker already guarantees we were addressed. This second gate exists so an
operator can silence a group from the dashboard without waiting on the worker's
config cache.

### 5.5 Reply to the message, not the room

Dispatch must quote the triggering message. In a group, an unquoted reply
arriving three messages later is unattributable noise. Pass the inbound
`messageId` through to the send call and set Baileys' `quoted` option.

## 6. Dashboard

Minimum for Phase 1:

- Settings toggle: **Group chats** → `Agent.groupChatEnabled`, off by default,
  with one line of copy stating the AI only answers when tagged.
- Groups list (`src/app/dashboard/groups/page.tsx`): server component → DTO →
  `"use client"` table. Columns: subject, member count, last activity, reply
  mode. Per-row `mention` / `off` toggle.
- Group threads appear in the conversations list with a group affix and the
  sender name rendered above each inbound bubble.

Follow the existing shape: `src/app/dashboard/<tab>/page.tsx` +
`src/components/dashboard/<Thing>.tsx` + co-located `page.module.css`.

Every query is tenant-scoped (`where: { agentId, agent: { userId } }`); dates
`.toISOString()` before crossing the client boundary.

## 7. Billing

An addressed group message costs exactly one AI reply, same as a DM — it flows
through the existing charge path with no change. Unaddressed messages never
reach the orchestrator so they cost nothing.

Worth verifying explicitly in review: a group with 200 members must not multiply
any per-recipient charge. Nothing in the current path suggests it would, but the
blast radius if it did is large enough to check rather than assume.

## 8. Test plan

Unit (vitest, alongside existing worker tests):

- `group-mention.test.ts` — the six cases in §4.2.
- `resolve-jid.test.ts` — a `@g.us` JID returns unchanged.

Integration, on a scratch group with two real handsets:

1. Bot added to group → `GroupChat` row appears, no reply sent.
2. Plain group chatter → nothing forwarded, no `Message` rows, no credits spent.
3. `@bot what are your hours` → one reply, quoting the trigger message.
4. Reply-to-a-bot-message without mention → replies.
5. Two people tag it within the debounce window → **one** coalesced reply.
6. `replyMode = off` → silent.
7. `groupChatEnabled = false` → back to today's behaviour exactly.
8. Confirm 1:1 conversations are byte-identical in behaviour throughout.

## 9. Rollout

1. Ship the `resolve-jid` fix alone.
2. Ship the migration (additive, inert while the flag is off).
3. Ship worker + orchestrator with `groupChatEnabled` default false.
4. Enable on one internal agent, in one group, for about a week. Watch
   `WorkerEvent` for disconnects and the ban-risk score.
5. Expose the dashboard toggle once that week is clean.

Every step is independently revertible, and step 3 is a no-op in production
until someone flips a flag.

---

# Phase 2 — proactive topics

**Do not build this with Phase 1.** Ship reactive, run it, then decide.

## 10. What was asked for

Operator defines topics; the AI raises them in the group on a schedule.

## 11. Why it is a different risk class

Phase 1 only ever speaks when spoken to. Phase 2 makes the account originate
unsolicited group messages, which is the single fastest route to a ban.
`src/lib/analyst/banRisk.ts` already treats group-invite links and mass
near-identical sends as forensic ban signals, derived from the July-2026
incident. This feature manufactures exactly that pattern unless it is capped
hard from the start.

## 12. Shape, if built

Reuse the campaign idiom rather than inventing a scheduler.
`BroadcastRecipient` already has a `jid` column, so a group is a valid target
today.

```prisma
model GroupTopic {
  id           String    @id @default(cuid())
  groupChatId  String
  groupChat    GroupChat @relation(fields: [groupChatId], references: [id], onDelete: Cascade)
  topic        String    @db.Text
  status       String    @default("active")   // active | paused | exhausted
  lastPostedAt DateTime?
  postCount    Int       @default(0)
  maxPosts     Int       @default(1)
  createdAt    DateTime  @default(now())

  @@index([groupChatId, status])
}
```

Caps enforced **server-side**, not as UI hints:

- Max 1 proactive post per group per day; hard ceiling 3/week.
- Minimum 4h since our own last message in that group.
- Only post if a **human** posted in the group within the last 24h — never
  break silence in a dormant group.
- Never post into a group joined less than 7 days ago.
- Skip when the agent's ban-risk score is `elevated` or `high`.
- Generated per post from the topic, never a fixed string sent to N groups —
  `messageSimilarity()` from `banRisk.ts` already exists to check drift, and
  near-duplicates across groups are the exact pattern that got accounts banned.
- One kill switch that halts all proactive posting account-wide.

Every proactive post writes a `WorkerEvent` so the analyst can see them.

## 13. Recommendation

Ship Phase 1. Live with it for a few weeks. Revisit Phase 2 only with the caps
above designed in from the first commit — retrofitting them onto a working
scheduler will not happen once it is shipped.

---

## 14. Open questions

1. **Group joining.** Does the operator add the bot's number to groups manually,
   or do we accept invite links? Manual only is safer and is assumed above.
2. **History.** Should the AI see group messages that did not address it? Better
   answers, but multiplies token cost and misattribution risk. Assumed **no**.
3. **Multiple mentions in one burst.** Two people tag it inside the debounce
   window: one reply (assumed) or one each?
4. **Admin-only mode.** Should the AI answer only group admins? Cheap to add
   later via `GroupChat.replyMode = 'admins'`.
5. **Sub-JID identity.** Confirm on a real device whether `sock.user.lid` is
   populated in this Baileys version; if not, the self-JID set in §4.2 needs
   another source or mention detection silently never fires.
