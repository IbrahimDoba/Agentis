import Link from "next/link"
import type { Metadata } from "next"
import { Navbar } from "@/components/landing/Navbar"
import { Footer } from "@/components/landing/Footer"
import { CodeTabs, type CodeSample } from "./CodeTabs"
import styles from "./page.module.css"

export const metadata: Metadata = {
  title: "Developer API — Agentis",
  description:
    "Run, manage, and message your Agentis AI agents from your own apps. Chat completions, agent management, and outbound WhatsApp — billed against your existing credits. cURL, JavaScript & Python examples.",
}

const BASE = "https://app.dailzero.com"

// --- Chat completions ---
const CHAT: CodeSample[] = [
  {
    label: "cURL",
    code: `curl ${BASE}/api/v1/chat/completions \\
  -H "Authorization: Bearer dz_live_..." \\
  -H "Content-Type: application/json" \\
  -d '{
    "agentId": "<your-agent-id>",
    "messages": [{ "role": "user", "content": "do you sell ferrari caps?" }]
  }'`,
  },
  {
    label: "JavaScript",
    code: `const res = await fetch("${BASE}/api/v1/chat/completions", {
  method: "POST",
  headers: {
    Authorization: "Bearer dz_live_...",
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    agentId: "<your-agent-id>",
    messages: [{ role: "user", content: "do you sell ferrari caps?" }],
  }),
})
const data = await res.json()
console.log(data.message.content)`,
  },
  {
    label: "Python",
    code: `import requests

res = requests.post(
    "${BASE}/api/v1/chat/completions",
    headers={"Authorization": "Bearer dz_live_..."},
    json={
        "agentId": "<your-agent-id>",
        "messages": [{"role": "user", "content": "do you sell ferrari caps?"}],
    },
)
print(res.json()["message"]["content"])`,
  },
]

const CHAT_RESPONSE = `{
  "message": { "role": "assistant", "content": "Yes — Ferrari F1 White Cap (₦23,000)..." },
  "usage": { "input_tokens": 1240, "output_tokens": 142, "credits": 2 },
  "remaining_credits": 11218
}`

// --- Send a WhatsApp message ---
const SEND: CodeSample[] = [
  {
    label: "cURL",
    code: `curl ${BASE}/api/v1/messages \\
  -H "Authorization: Bearer dz_live_..." \\
  -H "Content-Type: application/json" \\
  -d '{
    "agentId": "<your-agent-id>",
    "to": "2348012345678",
    "text": "Hi! Your order #1234 has shipped"
  }'`,
  },
  {
    label: "JavaScript",
    code: `const res = await fetch("${BASE}/api/v1/messages", {
  method: "POST",
  headers: {
    Authorization: "Bearer dz_live_...",
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    agentId: "<your-agent-id>",
    to: "2348012345678",
    text: "Hi! Your order #1234 has shipped",
  }),
})
console.log(await res.json())`,
  },
  {
    label: "Python",
    code: `import requests

res = requests.post(
    "${BASE}/api/v1/messages",
    headers={"Authorization": "Bearer dz_live_..."},
    json={
        "agentId": "<your-agent-id>",
        "to": "2348012345678",
        "text": "Hi! Your order #1234 has shipped",
    },
)
print(res.json())`,
  },
]

const SEND_RESPONSE = `{
  "message_id": "a1b2c3",
  "status": "queued",
  "usage": { "credits": 5 },
  "remaining_credits": 11195
}`

// --- Verify a contact ---
const VERIFY: CodeSample[] = [
  {
    label: "cURL",
    code: `curl ${BASE}/api/v1/contacts/check \\
  -H "Authorization: Bearer dz_live_..." \\
  -H "Content-Type: application/json" \\
  -d '{ "agentId": "<your-agent-id>", "phone": "2348012345678" }'`,
  },
  {
    label: "JavaScript",
    code: `const res = await fetch("${BASE}/api/v1/contacts/check", {
  method: "POST",
  headers: {
    Authorization: "Bearer dz_live_...",
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ agentId: "<your-agent-id>", phone: "2348012345678" }),
})
const { exists, jid } = await res.json()`,
  },
  {
    label: "Python",
    code: `import requests

res = requests.post(
    "${BASE}/api/v1/contacts/check",
    headers={"Authorization": "Bearer dz_live_..."},
    json={"agentId": "<your-agent-id>", "phone": "2348012345678"},
)
print(res.json())  # {"exists": True, "jid": "...@s.whatsapp.net"}`,
  },
]

// --- List agents ---
const LIST_AGENTS: CodeSample[] = [
  {
    label: "cURL",
    code: `curl ${BASE}/api/v1/agents \\
  -H "Authorization: Bearer dz_live_..."`,
  },
  {
    label: "JavaScript",
    code: `const res = await fetch("${BASE}/api/v1/agents", {
  headers: { Authorization: "Bearer dz_live_..." },
})
const { agents } = await res.json()`,
  },
  {
    label: "Python",
    code: `import requests

res = requests.get(
    "${BASE}/api/v1/agents",
    headers={"Authorization": "Bearer dz_live_..."},
)
print(res.json()["agents"])`,
  },
]

// --- Manage webhook tools ---
const TOOLS: CodeSample[] = [
  {
    label: "cURL",
    code: `curl -X PUT ${BASE}/api/v1/agents/<id>/tools \\
  -H "Authorization: Bearer dz_live_..." \\
  -H "Content-Type: application/json" \\
  -d '{ "tools": [
    { "name": "check_stock", "description": "Check stock for a product",
      "url": "https://your-api.com/stock", "method": "GET",
      "parameters": [
        { "name": "sku", "type": "string", "description": "Product SKU", "required": true }
      ] }
  ] }'`,
  },
  {
    label: "JavaScript",
    code: `const res = await fetch("${BASE}/api/v1/agents/<id>/tools", {
  method: "PUT",
  headers: {
    Authorization: "Bearer dz_live_...",
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    tools: [
      {
        name: "check_stock",
        description: "Check stock for a product",
        url: "https://your-api.com/stock",
        method: "GET",
        parameters: [
          { name: "sku", type: "string", description: "Product SKU", required: true },
        ],
      },
    ],
  }),
})`,
  },
  {
    label: "Python",
    code: `import requests

requests.put(
    "${BASE}/api/v1/agents/<id>/tools",
    headers={"Authorization": "Bearer dz_live_..."},
    json={
        "tools": [
            {
                "name": "check_stock",
                "description": "Check stock for a product",
                "url": "https://your-api.com/stock",
                "method": "GET",
                "parameters": [
                    {"name": "sku", "type": "string", "description": "Product SKU", "required": True},
                ],
            },
        ],
    },
)`,
  },
]

const ERRORS: [string, string, string][] = [
  ["BAD_REQUEST", "400", "Malformed request (bad JSON, missing or oversized fields)."],
  ["UNAUTHORIZED", "401", "Missing, malformed, unknown, or revoked key."],
  ["INSUFFICIENT_CREDITS", "402", "Account balance can't cover the call."],
  ["DAILY_CAP_HIT", "402", "The key's daily spending cap is exhausted."],
  ["FORBIDDEN_SCOPE", "403", "The key lacks the scope this endpoint requires."],
  ["AGENT_NOT_FOUND", "404", "The agent doesn't exist or isn't yours."],
  ["AGENT_NOT_CONNECTED", "409", "The agent's WhatsApp isn't connected — connect it before sending."],
  ["RATE_LIMITED", "429", "Too many requests — retry after the Retry-After header."],
  ["INTERNAL", "500", "Something went wrong on our side."],
]

export default function DevelopersPage() {
  return (
    <>
      <Navbar />
      <main className={styles.page}>
        <header className={styles.hero}>
          <span className={styles.eyebrow}>Developer API</span>
          <h1 className={styles.title}>Run your AI agents from your own code</h1>
          <p className={styles.lead}>
            Call an Agentis agent over HTTP and get a reply with its full brain — system prompt, knowledge
            base, and tools — manage the agent programmatically, or send outbound WhatsApp messages. Billed
            against the same credits as WhatsApp. Examples in cURL, JavaScript &amp; Python.
          </p>
          <div className={styles.heroLinks}>
            <Link href="/dashboard/api-keys" className={styles.cta}>
              Get an API key →
            </Link>
            <a href="/llms-api.txt" className={styles.ctaGhost}>llms-api.txt (for AI tools)</a>
          </div>
        </header>

        <section className={styles.section}>
          <h2>Three surfaces</h2>
          <div className={styles.surfaces}>
            <div className={styles.surfaceCard}>
              <h3>Run</h3>
              <code>POST /v1/chat/completions</code>
              <p>Talk to an agent, get a reply + usage. Needs a key with the <strong>chat</strong> scope.</p>
            </div>
            <div className={styles.surfaceCard}>
              <h3>Manage</h3>
              <code>/v1/agents/*</code>
              <p>List your agents and configure their webhook tools. Needs a key with the <strong>manage</strong> scope.</p>
            </div>
            <div className={styles.surfaceCard}>
              <h3>Messaging</h3>
              <code>POST /v1/messages</code>
              <p>Send outbound WhatsApp messages + verify contacts from a connected agent. Needs a key with the <strong>messages</strong> scope.</p>
            </div>
          </div>
        </section>

        <section className={styles.section}>
          <h2>Authentication</h2>
          <p className={styles.body}>
            Every request authenticates with a bearer API key created in your{" "}
            <Link href="/dashboard/api-keys">dashboard</Link>. The raw key is shown once at creation — store
            it securely. Keys carry <strong>scopes</strong>: <code>chat</code> (run agents, safe to embed
            client-side), <code>manage</code> (configure agents), and <code>messages</code> (send outbound) —
            the last two are server-side only.
          </p>
          <pre className={styles.code}>Authorization: Bearer dz_live_a1b2c3d4...</pre>
        </section>

        <section className={styles.section}>
          <h2>Find your agent ID</h2>
          <p className={styles.body}>
            Every call takes an <code>agentId</code>. Two ways to get it:
          </p>
          <ul className={styles.list}>
            <li>
              <strong>Dashboard</strong> — open the agent; its ID is in the URL:{" "}
              <code>app.dailzero.com/dashboard/agent/&lt;AGENT_ID&gt;</code>
            </li>
            <li>
              <strong>API</strong> — call <code>GET /v1/agents</code> with a <code>manage</code>-scoped key
              (see <Link href="#list-agents">List your agents</Link> below); each item&apos;s <code>id</code>{" "}
              is the agent ID.
            </li>
          </ul>
        </section>

        <section className={styles.section}>
          <h2>Run an agent — chat completions</h2>
          <p className={styles.body}>
            Send the conversation so far, get the agent&apos;s reply with its persona, knowledge base, and
            tools. Billed by token-weighted credits.
          </p>
          <CodeTabs samples={CHAT} />
          <p className={styles.caption}>Response</p>
          <pre className={styles.code}>{CHAT_RESPONSE}</pre>
        </section>

        <section className={styles.section}>
          <h2>Send a WhatsApp message</h2>
          <p className={styles.body}>
            Once your agent&apos;s WhatsApp is connected, send outbound messages programmatically. Sends go
            through the same anti-ban pacing as the dashboard and are billed per message. Want pure outbound
            with no AI auto-replies? Turn <strong>AI replies</strong> off for the agent in its settings.
          </p>
          <CodeTabs samples={SEND} />
          <p className={styles.caption}>Response</p>
          <pre className={styles.code}>{SEND_RESPONSE}</pre>
        </section>

        <section className={styles.section}>
          <h2>Verify a contact</h2>
          <p className={styles.body}>
            Check a number is reachable on WhatsApp before sending. Free (no credits).
          </p>
          <CodeTabs samples={VERIFY} />
        </section>

        <section className={styles.section} id="list-agents">
          <h2>List your agents</h2>
          <p className={styles.body}>Find an agent&apos;s id to use in the calls above.</p>
          <CodeTabs samples={LIST_AGENTS} />
        </section>

        <section className={styles.section}>
          <h2>Manage an agent&apos;s tools</h2>
          <p className={styles.body}>
            Define the webhook tools your agent can call — the same tools it uses on WhatsApp.
          </p>
          <CodeTabs samples={TOOLS} />
        </section>

        <section className={styles.section}>
          <h2>Limits &amp; safety</h2>
          <ul className={styles.list}>
            <li>Per-key rate limit (default 60 requests/minute) → <code>429</code> with <code>Retry-After</code>.</li>
            <li>Optional per-key daily spending cap, set when you create the key.</li>
            <li>Hard per-request output cap so a single call can&apos;t run up a huge bill.</li>
            <li>Send an <code>Idempotency-Key</code> header to safely retry without double-charging.</li>
            <li>A pre-flight credit check blocks calls your balance can&apos;t cover.</li>
          </ul>
        </section>

        <section className={styles.section}>
          <h2>Errors</h2>
          <p className={styles.body}>
            Every error returns <code>{`{ "error": { "code", "message", "request_id" } }`}</code>. Branch on{" "}
            <code>code</code>.
          </p>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Code</th>
                <th>HTTP</th>
                <th>Meaning</th>
              </tr>
            </thead>
            <tbody>
              {ERRORS.map(([code, http, meaning]) => (
                <tr key={code}>
                  <td><code>{code}</code></td>
                  <td>{http}</td>
                  <td>{meaning}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className={styles.ctaSection}>
          <h2>Ready to build?</h2>
          <Link href="/dashboard/api-keys" className={styles.cta}>
            Create an API key →
          </Link>
        </section>
      </main>
      <Footer />
    </>
  )
}
