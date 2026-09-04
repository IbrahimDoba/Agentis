# External Developer API

The External Developer API lets developers use their Agentis agents directly from
their own apps and channels — billed against the same credit pool as WhatsApp.

There are **three surfaces**:

| Surface | What it does | Base path | Burns credits? |
|---|---|---|---|
| **A — Run** | Talk to an agent, get a reply | `POST /v1/chat/completions` | ✅ Yes |
| **B — Manage** | Configure agents (persona, knowledge/products, tools) | `/v1/agents/*` | ❌ No (rate-limited) |
| **C — Messaging** | Send outbound WhatsApp (text, image, video, document) + verify contacts | `POST /v1/messages`, `/v1/contacts/check` | ✅ Send / ❌ verify |

These surfaces are powered by the **same engine** the dashboard and WhatsApp use —
the orchestrator's chat loop, RAG knowledge base, configured tools, and the
shared credit ledger. The API is just a new, API-key-authenticated front door to
that engine.

## What a developer can do

- **Send media**, not just text. `POST /v1/messages` takes `type` of `image`,
  `video` or `document` plus a publicly reachable `mediaUrl`; `text` becomes the
  caption. Documents also need a `fileName` — WhatsApp shows it to the recipient.
  The worker fetches the URL at send time, so it must still resolve then, and it
  goes through the same anti-ban pacing as every other send. Billing is per type
  (a video costs more than a text) and the charge comes back as `usage.credits`.
- **Run an agent** from any app or channel (website widget, Telegram, SMS, in-app,
  backend automation). The reply comes with the agent's persona, RAG knowledge,
  and its configured tools — not a raw LLM.
- **Provision an agent in code**: create it, set its system prompt, upload its
  products/knowledge (auto-indexed for RAG), and define its webhook tools — all
  the things they'd otherwise do by hand in the dashboard.

## What a developer cannot do (guardrails)

- ❌ Override the agent's system prompt inside a chat call (no prompt injection).
- ❌ Pass inline/custom tool definitions inside a chat call. (Persistent tools are
  managed via Surface B, which goes through the same validation as the dashboard.)
- ❌ Exceed the per-request output cap, per-key rate limit, or daily spending cap.
- ❌ Spend past the account's wallet/plan balance (pre-flight credit check).
- ❌ Touch agents that don't belong to the key's owner.

## Build status

| Capability | Status |
|---|---|
| API keys (generate / verify / revoke / spend tracking) + scopes | ✅ Live (foundation) |
| API-key auth + agent-ownership checks | ✅ Live (foundation) |
| Standard error envelope | ✅ Live (foundation) |
| Dashboard API-key management UI (create / list / revoke) | ✅ Live (`/dashboard/api-keys`) |
| `POST /v1/chat/completions` (Surface A) | ✅ Live |
| Rate limit / output cap / idempotency / daily-cap enforcement | ✅ Live |
| `/v1/agents/*` — list/get + webhook-tools management (Surface B) | ✅ Live |
| `POST /v1/messages` + `POST /v1/contacts/check` (Surface C) | ✅ Live |
| `POST /v1/messages` image / video / document sends | ✅ Live |
| `/v1/agents` create + knowledge/products upload | 🚧 Deferred (provisioning + RAG-heavy) |
| Public `/developers` docs page | ✅ Live |

See [`../../API_SESSION.md`](../../API_SESSION.md) for the full phased plan.

## Pages

- [Authentication & API keys](./authentication.md)
- [Chat completions (Surface A)](./chat-completions.md)
- [Agent management (Surface B)](./management.md)
- [Messaging (Surface C)](./messaging.md)
