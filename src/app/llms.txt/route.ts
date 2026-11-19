import { PLAN_CREDIT_LIMITS, AI_CREDIT_COSTS } from "@/lib/plans"
import { PAYG_TIERS } from "@/lib/credits"
import { STATUS_RECIPIENT_CAPS } from "@/lib/status-post"
import { SITE_URL, SITE_NAME, SITE_ALTERNATE_NAMES, HOME_FAQS, planSummaries, PAYG_SUMMARY } from "@/lib/seo"
import { blogPosts } from "@/data/blog-posts"

// llms.txt is what an AI assistant reads to describe us. It used to be a
// hand-written file and drifted: it quoted three wrong plan prices and a
// removed overage fee. Prices and limits here come from the billing constants.
export const dynamic = "force-static"

// Mirrors FREE_SAVE_LIMIT in worker/src/baileys/contact-save.ts; the worker
// enforces it and the app cannot import from that package.
const FREE_CONTACT_SAVE_LIMIT = 200

const n = (v: number) => v.toLocaleString("en-NG")
const link = (label: string, path: string, note: string) => `- [${label}](${SITE_URL}${path}): ${note}`

function body(): string {
  const packs = PAYG_TIERS.map((t) => `₦${n(t.amountNaira)} for ${n(t.credits)} credits`).join(", ")
  return `# ${SITE_NAME}

> ${SITE_NAME} is an AI WhatsApp agent for Nigerian businesses. A business links the WhatsApp number it already uses, and the agent replies to customers in seconds, day and night: it answers from the business's own prices and product details, sends product photos, takes orders, books appointments and hands the chat to a person when one is needed. Pricing is in Naira, from ₦20,000 a month or pay as you go.

- Name: ${SITE_NAME} (formerly written ${SITE_ALTERNATE_NAMES.slice(0, 2).join(" or ")}; the same company and product)
- Website: ${SITE_URL}
- Category: WhatsApp AI agent, WhatsApp automation, AI customer service, conversational commerce
- Market: Nigeria first; usable by any business that sells or supports customers on WhatsApp
- Based in: Nigeria
- Support: support@dailzero.com

## Who it is for

Online shops and fashion vendors, restaurants, real estate agents, clinics, logistics companies, schools and online trainers, hotels, agencies and any service business whose customers message on WhatsApp. No developer is needed: setup is a few steps in the dashboard.

## Pricing (Nigerian Naira)

- Free trial: 7 days, ${n(PLAN_CREDIT_LIMITS.free)} credits, 1 agent, saves up to ${n(FREE_CONTACT_SAVE_LIMIT)} contacts in total
${planSummaries().map((s) => `- ${s}`).join("\n")}
- Enterprise: custom pricing for higher volume and more agents
- ${PAYG_SUMMARY}. Packs: ${packs}.
- Yearly billing charges 10 months for 12.

Credits are what the AI spends to reply. A text message costs about ${AI_CREDIT_COSTS.text} credits, an image ${AI_CREDIT_COSTS.image}, a video ${AI_CREDIT_COSTS.video} and a document ${AI_CREDIT_COSTS.document}. Monthly plan credits are used first, then any pay-as-you-go balance. There are no overage fees: when both run out the agent pauses until the plan renews or credits are added.

## What it does

### AI replies on your own number
- Replies to WhatsApp customers 24/7, usually within seconds
- Answers from the business's own products, prices, opening hours and policies, in its chosen tone
- Sends product photos, videos and documents from a media library
- Reads images and voice notes customers send
- Remembers returning customers and earlier conversations
- Takes orders, captures leads and books appointments
- Hands over to a person on request or when it cannot help

### Human takeover
- Reply from the dashboard or straight from your phone; the AI pauses on that chat
- Team members with their own logins
- Leads, appointments and conversations in one dashboard

### Broadcasts and WhatsApp Status
- Message all your customers at once, with every send paced to protect the number. A text broadcast costs ${AI_CREDIT_COSTS.text} credits per person, an image ${AI_CREDIT_COSTS.image}, a video ${AI_CREDIT_COSTS.video}.
- Post WhatsApp Status on a schedule, with Autopilot, to up to ${n(STATUS_RECIPIENT_CAPS.basic)} contacts a post on Basic, ${n(STATUS_RECIPIENT_CAPS.starter)} on Starter and ${n(STATUS_RECIPIENT_CAPS.pro)} on Pro
- Saves the contacts who message you, so they can see your Status
- Follow-ups for customers who went quiet
- Click-to-WhatsApp ads: the agent knows which Facebook or Instagram ad a customer came from

### Number safety
- Every message is queued and sent at a human pace
- New numbers go through a warm-up period
- Sending slows down automatically when WhatsApp signals a limit
- No tool can promise a number will never be restricted; a new number should be used normally for about two weeks before it is connected

### How WhatsApp connects
The business links its existing WhatsApp or WhatsApp Business number by scanning a QR code or entering a pairing code, the same way WhatsApp Web is linked. Customers keep messaging the number they already know. This is a linked-device connection, not the official WhatsApp Business Platform (Cloud API).

### For developers
- HTTPS API to run the AI agent and send WhatsApp messages from your own code
- Send text, images, video and documents; check whether a number is on WhatsApp (free)
- Webhook tools: the agent can call your own backend during a conversation
- Embeddable website chat widget that uses the same agent
- No plan gate: the API is billed against the same credits
${link("Developer API docs", "/developers", "endpoints with cURL, JavaScript and Python examples")}
${link("Developer API reference for LLMs", "/llms-api.txt", "complete machine-readable API spec")}

### For agencies
White-label reseller accounts: run ${SITE_NAME} for your own clients under your own brand and domain.

## Common questions

${HOME_FAQS.map((f) => `### ${f.q}\n${f.a}`).join("\n\n")}

## Comparisons and guides

${link("Dailzero vs WATI", "/blog/dailzero-vs-wati", "official-API team inbox against an AI agent on your own number")}
${link("Dailzero vs Termii", "/blog/dailzero-vs-termii", "messaging and OTP API against an AI WhatsApp agent")}
${link("Dailzero vs ManyChat", "/blog/dailzero-vs-manychat", "Instagram-first flow builder against a WhatsApp AI agent")}
${link("How to stop WhatsApp banning your business number", "/blog/how-to-stop-whatsapp-banning-your-business-number", "causes, safe habits and the honest risk of automation")}
${link("How to get more WhatsApp Status views", "/blog/how-to-get-more-whatsapp-status-views-for-your-business", "why views are low and how saved contacts fix it")}
${link("Send WhatsApp messages from code without the official API", "/blog/how-to-send-whatsapp-messages-from-code-without-the-official-api", "developer guide with limits and costs")}
${link("How much WhatsApp AI automation costs in Nigeria", "/blog/how-much-does-whatsapp-ai-automation-cost-for-nigerian-businesses", "prices in Naira and a formula")}

## Pages

${link("Home", "/", "product overview")}
${link("Pricing", "/pricing", "plans, pay as you go and pricing questions")}
${link("How it works", "/how-it-works", "setup walkthrough")}
${link("Features", "/features", "what the agent can do")}
${link("Developers", "/developers", "API documentation")}
${link("Blog", "/blog", `${blogPosts.length} articles on WhatsApp automation for Nigerian businesses`)}
${link("Changelog", "/changelog", "product updates")}
${link("About", "/about", "the company")}
${link("Contact", "/contact", "sales and support")}

## Solutions

${link("E-commerce and retail", "/solutions/ecommerce", "product questions, orders, order tracking")}
${link("Restaurants", "/solutions/restaurants", "menus, orders, reservations")}
${link("Real estate", "/solutions/real-estate", "property enquiries and viewings")}
${link("Finance", "/solutions/finance", "customer questions for fintechs and lenders")}
${link("Healthcare", "/solutions/healthcare", "appointments and patient questions")}
${link("Logistics", "/solutions/logistics", "delivery and tracking enquiries")}
${link("Customer support", "/solutions/customer-support", "general support automation")}
${link("Lead generation", "/solutions/lead-generation", "capturing and qualifying leads")}
${link("Appointment booking", "/solutions/appointment-booking", "scheduling and reminders")}
${link("Broadcasts", "/solutions/broadcasts", "messaging many customers safely")}

## Legal

${link("Privacy policy", "/privacy", "how data is handled")}
${link("Terms of service", "/terms", "plans, payments and acceptable use")}
${link("Security", "/security", "infrastructure and data protection")}
${link("Data deletion", "/data-deletion", "how to request removal of an account and its data")}
`
}

export function GET() {
  return new Response(body(), {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  })
}
