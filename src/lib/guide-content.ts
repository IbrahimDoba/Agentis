// Centralised guide content. Each topic is rendered as markdown by the
// helper at src/lib/markdown.tsx (which supports headings, lists, links,
// bold/italic, blockquotes). Keep prose tight and action-oriented — these
// guides exist to unblock real users, not to read like a brochure.

export type GuideCategory = "getting-started" | "pages" | "agent" | "features"

export interface GuideTopic {
  slug: string
  title: string
  category: GuideCategory
  emoji: string
  intro: string
  body: string
  related?: string[]
}

export const GUIDE_CATEGORIES: { id: GuideCategory; label: string; description: string }[] = [
  {
    id: "getting-started",
    label: "Getting Started",
    description: "First-time setup, end-to-end. Read these in order if you're new.",
  },
  {
    id: "pages",
    label: "Dashboard Pages",
    description: "What every page in the dashboard is for and how to use it.",
  },
  {
    id: "agent",
    label: "Agent Configuration",
    description: "Each tab on the agent edit page, and what to put in it.",
  },
  {
    id: "features",
    label: "Features Deep-Dive",
    description: "Longer reads on specific features — anti-ban, follow-ups, billing math.",
  },
]

export const GUIDE_TOPICS: GuideTopic[] = [
  // ── Getting Started ──────────────────────────────────────────────────────
  {
    slug: "welcome",
    title: "Welcome to D-Zero AI",
    category: "getting-started",
    emoji: "👋",
    intro: "What D-Zero AI is, what it isn't, and how the moving parts fit together.",
    body: `> **Quick version:** D-Zero AI is an assistant that answers your WhatsApp customers for you. You teach it about your business, connect your WhatsApp number, and it handles incoming chats — and you can step in whenever you want.

### What it is

D-Zero AI is an AI agent platform for WhatsApp. You configure an agent that knows your business, link a WhatsApp number to it, and the agent handles incoming customer conversations on your behalf — answering questions, recommending products, capturing leads, taking orders, and more.

### How the pieces fit

There are three things to know about:

- **Your agent** — the AI brain. You define its system prompt, give it your products, upload reference documents, and add tools (webhooks) it can call. Each agent is independent.
- **A WhatsApp connection** — done through the Channels page. You scan a QR code from your phone and the agent receives every message sent to that number.
- **Your dashboard** — where you watch conversations happen, take over manually when you need to, run broadcasts, manage leads, and configure everything.

### What it is *not*

- Not a CRM replacement — we capture leads but you'll still want a real CRM for long-term customer history.
- Not a payment processor — the agent can hand a customer a payment link via tools, but D-Zero doesn't move money.
- Not a magic content generator — the agent only knows what you tell it. Garbage in, garbage out.

### What to do next

Read **Setting up your first agent** then **Connecting WhatsApp**. After that you'll have a live agent answering messages.`,
    related: ["first-agent", "connecting-whatsapp"],
  },
  {
    slug: "first-agent",
    title: "Setting up your first agent",
    category: "getting-started",
    emoji: "🚀",
    intro: "The minimum config you need to get a working agent live in under 15 minutes.",
    body: `> **Quick version:** Create an agent, write a short "who you are and what you sell" prompt, add your products, connect WhatsApp, and test it. About 15 minutes start to finish.

### Step 1 — Create the agent

Go to **Agents → Create New**. Pick a template (Receptionist, Sales, Support) or start from scratch. The template fills the system prompt with sensible defaults; from-scratch gives you a blank slate.

The form has two tabs:

- **Profile** — business name, category, description, profile photo. Mostly cosmetic but the name is used in the system prompt.
- **Configuration** — the system prompt and your product catalogue. This is where the real work happens.

### Step 2 — Write the system prompt

The system prompt is the agent's instructions. Treat it like a one-page employee handbook. Cover:

- **Who you are.** "You are the support assistant for [Business Name], a [category] in [location]."
- **What you sell or offer.** Short list, or refer the agent to lookup tools.
- **Tone.** Friendly? Formal? Bilingual? Be specific.
- **Hard rules.** "Never quote a price not on the product list." "Always greet by name if known." "If asked about returns, say a human will follow up."

The agent only knows what you tell it here, plus what it can fetch through tools and documents.

### Step 3 — Add products

Optional but powerful. Each product becomes structured info the agent can reference confidently. Better than embedding prices in the prompt because the catalogue updates without rewriting prose.

### Step 4 — Connect WhatsApp

See **Connecting WhatsApp** for the QR-code flow.

### Step 5 — Test

Send a message to your connected WhatsApp number. The agent should reply. If it says something off, refine the system prompt and save — changes take effect on the next message.`,
    related: ["welcome", "connecting-whatsapp", "configuration-tab", "profile-tab"],
  },
  {
    slug: "connecting-whatsapp",
    title: "Connecting WhatsApp",
    category: "getting-started",
    emoji: "📱",
    intro: "How to link a WhatsApp number to an agent using the Channels page.",
    body: `> **Quick version:** Link your WhatsApp by scanning a QR code with your phone — the same way WhatsApp Web works. Takes about two minutes.

### What you need

- A WhatsApp account (personal or Business — both work).
- Your phone with WhatsApp installed and signed in.
- Two minutes.

### Step-by-step

1. Open **Channels → WhatsApp Web** in the sidebar.
2. Click your agent in the left list.
3. Choose how old your WhatsApp number is — this sets your starting warmup tier (see **Anti-ban & warmup tiers**). New numbers should pick "New number"; established numbers can pick "Established".
4. Click **Connect WhatsApp**. A QR code appears (it can take 1–3 minutes — that's normal).
5. On your phone, open WhatsApp → Settings → Linked Devices → Link a device → scan the QR.
6. Status flips to **Connected**. The agent now receives every message sent to that number.

### Pairing code option

If you can't scan QRs (e.g. tablet without camera), switch the toggle to **Phone Number** before clicking Connect. You'll get an 8-character code to type into WhatsApp manually.

### What "Disconnect" vs "Remove" do

- **Disconnect** — pauses the connection but keeps the auth credentials. Click **Reconnect** later to come back without scanning again.
- **Remove** — fully wipes the auth and disassociates the number from the agent. Requires a fresh QR scan to reconnect.

### Sessions can expire

WhatsApp invalidates a linked device after about 14 days of inactivity, or if you log out from your phone. When that happens the dashboard shows "Session expired by WhatsApp — scan a fresh QR to relink".

### What about WhatsApp Business API?

D-Zero AI uses **WhatsApp Web** (the same Linked Devices feature your personal WhatsApp uses). For higher-volume / enterprise use cases the official Business API tier is more reliable. Contact us about it.`,
    related: ["warmup-tiers", "first-agent"],
  },

  // ── Dashboard Pages ──────────────────────────────────────────────────────
  {
    slug: "conversations",
    title: "Conversations & human handoff",
    category: "pages",
    emoji: "💬",
    intro: "Watching live chats, taking over from the AI, and handing back when you're done.",
    body: `> **Quick version:** Watch every chat your AI is having, and jump in to reply yourself any time. The AI automatically steps aside while you handle it, then resumes when you hand back.

### What you see

The Conversations page lists every chat your agents have had, sorted by most recent activity. Click one to open the chat drawer with the full message history.

### AI mode vs Human mode

Each conversation has a **mode** — AI (the default) or Human. The toggle is in the chat drawer header.

- **AI mode** — the agent replies to every customer message automatically.
- **Human mode** — the agent stays silent. You handle replies manually from the dashboard input box (or directly from your phone).

### Auto-pause behaviour (default ON)

When you reply to a customer manually — from the dashboard input or directly via WhatsApp on your linked phone — the conversation **automatically flips to Human mode**. The next time the customer messages, the AI does NOT respond.

When you're ready to hand back to the AI, click the **AI** button on the conversation toggle. The agent resumes from the next customer message.

You can turn this auto-pause off in **Agent → Settings → Auto-pause AI when I reply manually**. With it off, your manual replies don't change the mode — you'd flip the toggle yourself.

### "AI paused" banner

When a conversation is in Human mode, a yellow banner appears across the top of the chat drawer reminding you the AI isn't replying. The banner disappears when you flip back to AI mode.

### Sending media

Currently the message input supports plain text. Voice notes and image replies that customers send are visible in the transcript but you can't reply with media from the dashboard yet.`,
    related: ["settings-tab", "auto-pause"],
  },
  {
    slug: "broadcasts",
    title: "Broadcasts",
    category: "pages",
    emoji: "📣",
    intro: "Sending one message to a list of contacts at once, paced safely.",
    body: `> **Quick version:** Send one message to a whole list of contacts at once. Sends are spaced out automatically so WhatsApp doesn't flag your number. Best for people who already know you — never cold lists.

### What broadcasts are for

Send the same message to many customers at once — promotions, restocks, important announcements. Distinct from follow-up campaigns (which generate personalised messages per contact).

### Setting up a broadcast

1. **Broadcasts → New Broadcast**.
2. Pick the agent that will send.
3. Paste your message and provide the contact list — either typed phone numbers or pasted from a spreadsheet.
4. Review the contact count. Each WhatsApp number you target must already exist on WhatsApp (verified before send).
5. Click **Start**.

### Pacing & limits

Sends are spread out with anti-ban delays — typically 5–15 seconds between messages on a fully warmed-up (Tier 4) number. On Tier 1, that's 45–90 seconds. So 100 contacts on T4 takes ~15 minutes, and on T1 ~2 hours.

The broadcast respects your warmup tier's daily cap. If your tier allows 1,500 messages/day and you're already at 1,200, the broadcast queues only 300; the rest waits for tomorrow.

### Pause, resume & cancel

Live progress is shown — sent / failed / remaining. You can **pause** any time and **resume** later; it picks up exactly where it left off. **Cancel** stops everything (an in-flight send still completes; queued ones stop).

If a broadcast ever stalls by itself — for example WhatsApp reconnected mid-send and the rest never went out — just click **Resume** and it re-sends only what's left. It never messages the same contact twice.

### When to use it (and when not to)

- ✅ Restock alerts to a curated list. Order confirmations to a recent buyer cohort.
- ❌ Mass cold outreach to people who never opted in. WhatsApp will ban your number fast.
- ❌ Anything you'd describe as "spam" — even your warmest list will report you.`,
    related: ["warmup-tiers", "follow-up-campaigns"],
  },
  {
    slug: "leads",
    title: "Leads",
    category: "pages",
    emoji: "🎯",
    intro: "How conversations get flagged as leads and how to track them through pipeline stages.",
    body: `> **Quick version:** After each chat, the AI flags people who showed buying interest as "leads" so you can follow up and track them from first contact to sale.

### How leads are detected

After every completed conversation, an AI scanner reads the transcript and decides whether the contact showed buying intent — questions about pricing, availability, "how do I order", "do you deliver to X", etc. If yes, the conversation gets flagged as a Lead and appears in the Leads page.

You can also flag any conversation manually as a lead from inside the chat drawer.

### Pipeline stages

Each lead has a status:

- **New** — just flagged, you haven't followed up yet.
- **Contacted** — you've reached out (manually or via a follow-up message).
- **Closed** — deal done, or lost — moved out of active pipeline.

Drag-and-drop or use the dropdown on each row to change status.

### Notes

Each lead has a private notes field — visible to your team but not the customer. Use it to track follow-up plans, pricing negotiated, etc.

### Acting on a lead

Click any lead row to open the original conversation with full transcript. From there you can manually message the customer or pass the conversation to a teammate.`,
    related: ["follow-up-campaigns", "team-workspaces"],
  },
  {
    slug: "team-workspaces",
    title: "Team & workspaces",
    category: "pages",
    emoji: "👥",
    intro: "Inviting team members to share access to your agents and conversations.",
    body: `> **Quick version:** Invite teammates to share your agents, chats, and leads. Each plan includes a set number of seats.

### How workspaces work

Every account has its own workspace by default. When you invite a team member, they get access to your workspace — they see the same agents, conversations, leads, and stats you do.

A user invited to multiple workspaces switches between them via the dropdown in the sidebar.

### Inviting a member

1. Open **Team** in the sidebar.
2. Enter their email and pick a role (Admin or Member).
3. They'll get a 7-day invite link by email. When they click it, they sign up (or log in if they already have an account) and land in your workspace.

### Roles

- **Admin** — can manage agents, invite/remove team members, edit settings, see all conversations.
- **Member** — can view conversations, manage leads, send manual replies. Cannot change agent config or invite others.

### Seat limits per plan

Each plan caps how many seats you can fill. Hitting the cap blocks new invites until you upgrade or remove someone.

| Plan | Members |
|---|---|
| Free | 0 (just you) |
| Basic | 1 |
| Starter | 2 |
| Pro | 5 |
| Enterprise | Unlimited |

### Removing a member

Open Team → click the member → Remove. They lose access immediately. Their past actions (replies sent, notes written) stay attributed to them historically.`,
    related: ["billing-credits"],
  },
  {
    slug: "billing-credits",
    title: "Billing & credits",
    category: "pages",
    emoji: "💳",
    intro: "How credits work, what gets billed, and the 30-day rolling cycle.",
    body: `> **Quick version:** Every message your AI sends costs credits. Replies you send yourself — from the dashboard or your phone — are free. Your credits refill every 30 days.

### What credits buy

Credits are consumed by **AI activity**, not human activity:

- 5 credits per AI text reply
- 8 credits per AI image send
- 3 credits per second of voice note transcription (15 credits minimum per note)

Manual replies you send (from the dashboard or your phone directly) are **free** — no credits charged.

### Plans

| Plan | Price | Credits/month |
|---|---|---|
| Free | — | 2,000 |
| Basic | ₦15,000 | 25,000 |
| Starter | ₦35,000 | 60,000 |
| Pro | ₦70,000 | 100,000 |
| Enterprise | Custom | Unlimited |

> If your account was set up by a reseller or partner, your plan names, prices, and credit amounts may differ from the table above. Your own **Billing** page always shows the plan that actually applies to you.

A typical text-only conversation uses ~10–30 credits. So 60,000 credits ≈ 2,000–6,000 conversations per month.

### Rolling 30-day cycle

Credits don't reset on the 1st of the month. They reset 30 days after your subscription's start date — so if you signed up on the 12th, your cycle resets on the 12th of the next month, every month. The Billing page shows your current period start and end.

### Overage

Some plans allow overage — if you exceed your monthly cap, you keep sending and pay for the extra at a per-1k-credits rate.

| Plan | Overage rate |
|---|---|
| Free, Basic | Not allowed — sends stop when cap hit |
| Starter | ₦1,000 per 1,000 credits |
| Pro | ₦800 per 1,000 credits |
| Enterprise | Custom |

### Upgrading

Click any plan card on the Billing or Subscription page → submit an upgrade request → we approve and apply it manually within a few hours. Bank transfer details are shown on the request page.`,
    related: ["team-workspaces"],
  },

  // ── Agent Configuration ─────────────────────────────────────────────────
  {
    slug: "profile-tab",
    title: "Profile tab",
    category: "agent",
    emoji: "🖼️",
    intro: "Cosmetic identity for your agent — name, photo, category. Doesn't affect AI behaviour directly.",
    body: `> **Quick version:** Your agent's name, photo, and category — its identity. It doesn't change how the AI talks; that's the Configuration tab.

### What the Profile tab is for

This tab holds the agent's **identity**: the business name, category, description, and profile photo. The values here are used in:

- The agent's display name in the dashboard.
- The system prompt headers when an agent template is used (templates auto-fill {{BUSINESS_NAME}} etc. from these values).
- The WhatsApp Business profile, if your number supports it.

It does **not** define what the agent says or how it behaves — that's the **Configuration** tab.

### Fields

- **Profile photo** — uploaded image, shown in the dashboard and (where possible) on the WhatsApp profile.
- **Business name** — the canonical name of this agent's business.
- **Category** — picks from a list (E-commerce, Restaurant, Healthcare, etc.). Helps templates pre-fill better.
- **Description** — one or two sentences. Embedded in the agent's system prompt at runtime when templates use \`{{BUSINESS_DESCRIPTION}}\`.

### Tips

- The business name here can differ from your account's business name. Useful if one account runs multiple brands.
- Keep the description short and customer-facing — it can leak into AI replies.`,
    related: ["configuration-tab"],
  },
  {
    slug: "configuration-tab",
    title: "Configuration tab",
    category: "agent",
    emoji: "⚙️",
    intro: "The system prompt and product catalogue. The most important tab in your agent.",
    body: `> **Quick version:** The most important tab — the instructions that tell your AI who it is and how to behave, plus the product list it can quote from accurately.

### System prompt

This is the agent's personality and instructions, written as a single block of text. The agent reads this every single conversation, so be clear.

A good system prompt covers:

1. **Identity** — who you are, what business you represent.
2. **Offerings** — what you sell or do. Short summary, plus refer to tools/products for current details.
3. **Tone** — friendly, professional, formal, bilingual, etc. Be concrete.
4. **Hard rules** — what the agent must never do. *Never quote prices not in the catalogue. Never promise refunds. Never share personal information.*
5. **Escalation triggers** — when to defer to a human.

### Generate with AI

The "Generate with AI" button takes whatever you've typed plus your business name and rewrites it as a stronger system prompt. Useful as a starting point — review the output before saving.

### Product catalogue

Below the system prompt is a structured product editor. Each product has a name, price, description, and (optional) image. Add up to as many as you need.

The agent automatically gets these products injected into its prompt at runtime. So if a customer asks "do you have X for under ₦5,000?", the agent can answer accurately without you mentioning every product in the prose.

### Important caveat

Anything in the **system prompt** AND anything in **product catalogue** is visible to the AI on every message. Don't put PII or secrets here — it's effectively shared with OpenAI.

### When to update

Save changes any time. The next inbound message picks up the new prompt. No restart, no deploy — instant.`,
    related: ["profile-tab", "documents-tab", "tools-tab"],
  },
  {
    slug: "documents-tab",
    title: "Documents (Knowledge Base)",
    category: "agent",
    emoji: "📚",
    intro: "Upload PDFs/Word/text files and the agent answers questions from them at runtime.",
    body: `> **Quick version:** Upload your files — PDFs, docs, menus, policies — and the AI answers customer questions using what's inside them.

### How it works

When you upload a document, we:

1. Extract its text.
2. Chunk it into ~500-word segments.
3. Generate embeddings (semantic vectors) for each chunk via OpenAI.
4. Store them in our vector database.

When a customer asks a question, the agent searches your documents semantically — pulling the most relevant chunks into its context — and answers using that content.

This is "RAG" (retrieval-augmented generation). The agent doesn't memorise the documents; it looks them up at query time.

### What works well

- Product catalogues, menus, pricing sheets.
- Policies (returns, shipping, privacy).
- FAQs in long-form.
- Operating procedures.
- Training material for the agent.

### What works poorly

- Scanned PDFs (no text layer — extraction returns garbage).
- Heavily formatted documents with tables (formatting often drops).
- Documents with conflicting information (the agent picks the chunk that best matches the query, even if outdated).

### Best practices

- Keep one topic per document. "Returns Policy.pdf" + "Shipping Costs.pdf" is better than one combined "Policies.pdf".
- Update by deleting the old doc and uploading the replacement — the chunks for the old version stick around if you don't.
- Big docs are chunked, so size up to about 10MB works fine.

### Caveats

- Documents augment the agent's knowledge but don't override the system prompt rules. If your prompt says "never quote prices", the agent won't, even if the document includes prices.
- Retrieval is fast but not free — every customer message triggers an embedding lookup. This is part of why credits scale with conversation count.`,
    related: ["configuration-tab", "tools-tab"],
  },
  {
    slug: "tools-tab",
    title: "Tools",
    category: "agent",
    emoji: "🔧",
    intro: "Webhooks the agent can call mid-conversation to fetch live data or take actions.",
    body: `> **Quick version:** Tools let your AI do things mid-chat — check an order, create a payment, book an appointment — by calling web links you provide.

### What tools are

Tools are HTTP endpoints **you** host. The agent decides when to call them based on the description you give. Use them for anything the agent can't know from the system prompt or documents alone — live order status, real-time inventory, payment account creation, appointment booking, etc.

### Adding a tool

1. **Tools tab → Add Tool**.
2. Name it (snake_case is conventional: \`check_order_status\`, not "Check Order Status").
3. Write a clear **description** — this is what the AI reads to decide when to call the tool. Be explicit. Bad: "Order status." Good: "Look up the delivery status of an order by order number. Call this when the customer asks where their order is."
4. Define parameters — name, type (string/number/boolean), whether required.
5. Choose method (POST or GET) and the full URL of your webhook.
6. Save.

### How calls work

When the AI decides to call your tool, we POST (or GET) to your URL with the parameters as JSON body or query string. Your endpoint does whatever it does and returns JSON. The AI then uses your response in its reply.

### Tool-use discipline

Every agent has built-in rules that the AI follows automatically:

- Call the tool every time the customer asks about that data — never reuse the answer from earlier in the conversation.
- Action tools (create_payment, place_order) should fire **once per intent**. If the follow-up check fails, the AI retries the *check*, not the action.
- Status tools always re-call to get fresh state.
- The AI must not invent data — if your tool errors, it tells the customer truthfully.

These rules are in the orchestrator's system prompt; you don't need to repeat them in your tool descriptions.

### Common patterns

- \`lookup_product(query)\` → search store catalogue.
- \`create_payment(productId, amount)\` → generate a payment account, return reference + URL.
- \`check_payment_status(reference)\` → return paid/pending.
- \`book_appointment(date, time, name)\` → calendar booking.

### Security

Your tool URLs are public from D-Zero's side. If your webhook is sensitive, validate the requests on your end — IP-allowlist our servers, or include a shared secret in a header you check.`,
    related: ["configuration-tab", "documents-tab"],
  },
  {
    slug: "settings-tab",
    title: "Settings tab",
    category: "agent",
    emoji: "🎛️",
    intro: "Per-agent toggles for conversation behaviours like auto-pause-on-human-reply.",
    body: `> **Quick version:** Per-agent on/off switches for how it behaves in chats. Right now: whether the AI pauses when you reply by hand.

### What lives here

The Settings tab holds **per-agent behavioural toggles**. Stuff that affects how the agent acts during conversations, distinct from what it knows (Configuration) or who it is (Profile).

Today this is one toggle. Over time it'll grow.

### Auto-pause AI when I reply manually

**Default: ON.**

When ON, any human reply you send (from the dashboard chat input OR from your phone via the linked WhatsApp) flips that single conversation into Human mode. The customer's next message is NOT answered by the AI — it waits for you. You manually flip back to AI mode when you're done.

When OFF, your manual replies don't change the mode. The AI keeps replying to the customer's next message even though you just sent something. Useful if you prefer to manage handoff explicitly with the AI/Human toggle on each conversation.

Most users want this ON. Turn it off only if you're a power user and the auto-flip is getting in your way.

### Future toggles

Things on the roadmap to land in this tab:

- **Default mode for new conversations** (AI / Human).
- **Quiet hours** — don't reply outside specified hours.
- **Auto-greet new contacts** — send a configurable greeting on first message.
- **Forward unhandled messages to email/SMS.**
- **Send typing indicator** — toggle whether the agent shows "typing…" before replying.`,
    related: ["conversations", "auto-pause"],
  },

  // ── Features Deep-Dive ───────────────────────────────────────────────────
  {
    slug: "follow-up-campaigns",
    title: "AI follow-up campaigns",
    category: "features",
    emoji: "💌",
    intro: "Automatically re-engage cold conversations with personalised AI-drafted messages.",
    body: `> **Quick version:** The AI finds chats that went cold, writes a friendly personal "just checking in" message for each one, and sends them slowly over a day so your number stays safe. You can review every message first, or let it send automatically.

### The idea

Most contacts who message your business once and don't buy never come back — usually because nobody followed up. Follow-up campaigns let the AI scan your conversation history, identify cold leads, draft personalised re-engagement messages, and send them in a paced batch.

### Two modes

- **Auto mode** — the AI drafts messages and sends them straight away (over a 24-hour window with anti-ban pacing). Hands-off.
- **Review mode** — the AI drafts, but each message waits in a review queue. You approve, edit, or reject one by one. Then the campaign sends only the approved ones.

Pick review mode for sensitive industries (healthcare, finance) or when you're trying out the feature for the first time. Auto mode for established stores running regular re-engagement.

### How conversations get picked

The scanner looks for conversations that:

- Have been inactive for at least \`minDaysSince\` days (configurable when you start a campaign).
- Have not received an automated follow-up in the past 7 days (per-conversation cooldown).
- Showed buying intent or engagement (not just a one-off "hi" with no reply).

For each picked conversation, the AI generates a personalised message using the contact's name, conversation context, and your business goals.

### Sending pace

Messages spread across 24+ hours minimum, with batch breaks every 10 sends and human-like pacing between each. You can't fire 500 follow-ups at once even if you wanted to — that's how numbers get banned.

### Live progress

The campaign page shows the counts updating live:

- **Found** — how many cold chats the scan picked.
- **Sent** — messages already delivered.
- **Scheduled** — drafted and waiting their turn in the 24-hour queue.
- **Skipped / Failed** — couldn't send (e.g. the contact is no longer reachable on WhatsApp).

### Cancelling

Cancel a running campaign and every not-yet-sent message stops. Already-sent ones can't be unsent.

### If a campaign gets stuck on "Sending"

Once in a while a campaign sits on **Sending** and stops moving — usually because WhatsApp briefly dropped and reconnected while it was working, which strands the messages that were still waiting. To get it going again:

1. Check the agent's WhatsApp shows **Connected** on the Channels page.
2. Open the campaign and click **Resend unsent**.

It re-queues only the messages that never went out and gives them a fresh 24-hour schedule. Anything that already sent is never sent twice — so it's always safe to click.

### Cost

Follow-up messages count as AI sends — billed at 5 credits each.`,
    related: ["broadcasts", "leads"],
  },
  {
    slug: "warmup-tiers",
    title: "Anti-ban & warmup tiers",
    category: "features",
    emoji: "🔥",
    intro: "How we keep your WhatsApp number from getting banned, and why daily caps grow over time.",
    body: `> **Quick version:** WhatsApp bans numbers that suddenly blast lots of messages. We raise your daily send limit slowly as your number ages, so it always looks like a normal business.

### Why warmup matters

WhatsApp aggressively bans numbers that look like spam — high outbound volume, no incoming messages, repetitive content, sends outside business hours. New numbers (just registered with WhatsApp) are most at risk. Established numbers with normal usage history can handle more.

Warmup gradually increases your daily send capacity as the number ages, mimicking how a real business would slowly scale its messaging.

### The four tiers

| Tier | Name | Daily cap | Hourly cap | Pacing delay |
|---|---|---|---|---|
| 1 | Warmup | 40 | 8 | 45–90s between sends |
| 2 | Starter | 150 | 25 | 20–45s |
| 3 | Growth | 400 | 60 | 10–25s |
| 4 | Full | 1,500 | 200 | 5–15s |

### How tier advances work

Tier 1 → Tier 2 after 3 days connected. Tier 2 → Tier 3 after 7 more. Tier 3 → Tier 4 after 21 more. So a brand-new number reaches Tier 4 in about 31 days.

When connecting a number on the Channels page, you choose the starting tier based on the number's age. A WhatsApp number that's been used for 6+ months by a real person/business can start at Tier 3 or 4 directly.

### Pacing delays

Between each send, the worker waits a random delay drawn from a normal distribution within the tier's range. So on Tier 4 ("5–15 seconds") most sends are around 8–12 seconds apart, but some are 5s and some are 15s — never identical, never robotic.

### Outside business hours

If you've configured business hours and the current time is outside that window, **Tiers 1–3** add an extra 30–120 second delay per message on top of the tier delay. **Tier 4 numbers skip this off-hours penalty** — they're trusted enough to send 24/7.

### Throttle detection

If WhatsApp starts returning errors (suggesting they're throttling you), the system detects this and automatically pauses outbound for a cooling-off period. Comes back on its own.

### Bans

If WhatsApp bans the number outright (status code 403), the agent goes into BANNED state in the dashboard. There's no recovery from a real ban — you'd need a fresh number.

### Best practices

- Don't max out your daily cap on day 1. Stay at 60–80% of cap to leave headroom.
- Don't send the exact same message to many contacts back-to-back. Use templates with light personalisation.
- Have customers actually message you — incoming traffic matters as much as outgoing.
- Avoid links in early messages on a new number. WhatsApp's spam filter is strict on links.`,
    related: ["broadcasts", "connecting-whatsapp"],
  },
  {
    slug: "auto-pause",
    title: "Auto-pause AI on human reply",
    category: "features",
    emoji: "⏸️",
    intro: "How the system knows you've taken over a conversation, and what to do if you'd rather it didn't.",
    body: `> **Quick version:** When you reply to a customer yourself, the AI goes quiet for that chat so you're not both replying at once. Switch it back to AI when you're done.

### The problem this solves

Most operators want the AI to handle conversations until they decide to step in — usually because the AI is mid-misunderstanding or the customer is asking something nuanced. The friction was that to step in cleanly, you had to remember to flip a toggle to "Human mode" before replying. People forgot, the AI replied at the same time as the human, and conversations got messy.

### What auto-pause does

Whenever you (or anyone on your team) sends an outbound message in a conversation that's currently in AI mode, the system **flips that conversation to Human mode automatically** — atomically with the message send. The next customer message is silently received, and the AI doesn't reply.

Two paths trigger this:

1. **Dashboard send** — typing into the chat input and clicking Send.
2. **Phone send** — replying to the customer directly via WhatsApp on your linked device.

The worker detects phone sends by watching WhatsApp's reflected outbound events that aren't ones we sent ourselves.

### Resuming AI

Click the **AI** toggle on the chat drawer header. The conversation flips back to AI mode. The next customer message gets handled normally.

### Turning auto-pause off

Some power users prefer to manage handoff explicitly. Open **Agent → Settings → Auto-pause AI when I reply manually** and toggle it off. With it off:

- Manual replies still go through (no errors).
- The conversation stays in AI mode after your reply.
- The AI continues replying to subsequent customer messages.
- You'd manually click the **Human** toggle if you want to take over fully.

### Edge case: in-flight AI replies

If the AI is mid-generating a reply at the moment you send your manual message, the AI reply is already queued and goes out. Your auto-pause catches the *next* customer message. So in rare cases the customer sees an AI reply right after your human reply. Fine in practice; nothing to do.`,
    related: ["conversations", "settings-tab"],
  },
]

export function getGuideBySlug(slug: string): GuideTopic | undefined {
  return GUIDE_TOPICS.find((t) => t.slug === slug)
}

export function getGuidesByCategory(category: GuideCategory): GuideTopic[] {
  return GUIDE_TOPICS.filter((t) => t.category === category)
}
