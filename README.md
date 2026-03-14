# Agentis

An agentic WhatsApp AI platform for businesses. Deploy a 24/7 AI agent that handles customer conversations on WhatsApp — automatically.

Built with Next.js 15 · TypeScript · Prisma · Neon PostgreSQL · ElevenLabs Conversational AI

---

## Overview

Agentis lets businesses submit their information (FAQs, products, operating hours, response guidelines), which an admin then uses to configure a WhatsApp AI agent via ElevenLabs. Once live, the agent handles all incoming customer messages automatically. Business owners can monitor conversations from their dashboard.

**MVP scope:** Up to 10 businesses with admin-gated onboarding.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 15 (App Router, Server Actions) |
| Language | TypeScript (strict) |
| Auth | NextAuth v5 (Auth.js) — Credentials provider |
| Database | PostgreSQL via Neon (serverless) |
| ORM | Prisma v7 |
| Validation | Zod |
| File Upload | UploadThing |
| AI Enhancement | OpenAI API (GPT-4o-mini) |
| WhatsApp / Chat | ElevenLabs Conversational AI API |
| Email | Resend |
| Styling | CSS Modules + CSS Custom Properties |
| Icons | Lucide React |
| Deployment | Vercel |

---

## Features

- **Landing page** with 3D spinning globe, features, how it works, pricing (₦50k / ₦100k), and contact form
- **Light / dark mode** toggle with localStorage persistence
- **User signup** with admin approval gate
- **Agent creation form** with optional AI-enhancement via OpenAI
- **Admin dashboard** to manage users, review agent configs, and set up ElevenLabs connections
- **Chat monitoring** — conversations fetched live from ElevenLabs API
- **Route protection** via Next.js proxy middleware

---

## Getting Started

### 1. Clone the repo

```bash
git clone https://github.com/IbrahimDoba/Agentis.git
cd Agentis
pnpm install
```

### 2. Set up environment variables

Create a `.env.local` file in the root:

```env
DATABASE_URL="postgresql://..."
NEXTAUTH_SECRET="your-secret"
NEXTAUTH_URL="http://localhost:3000"
OPENAI_API_KEY="sk-..."
ELEVENLABS_API_KEY="sk_..."
RESEND_API_KEY="re_..."
DEMO_EMAIL="you@example.com"
UPLOADTHING_TOKEN="..."
```

Generate a secret with:
```bash
openssl rand -base64 32
```

### 3. Set up the database

```bash
pnpm prisma generate
pnpm prisma db push
```

### 4. Run the dev server

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Setting Up Your Admin Account

1. Sign up at `/signup`
2. Run the following SQL via Prisma to approve yourself and set admin role:

```bash
pnpm prisma db execute --stdin <<'EOF'
UPDATE "User" SET status = 'APPROVED', role = 'ADMIN' WHERE email = 'your@email.com';
EOF
```

3. Log in at `/login` — you'll have access to both `/dashboard` and `/admin`

---

## Key User Flows

**New business signup**
`/signup` → Pending approval screen → Admin approves → User logs in → Dashboard

**Agent creation**
Dashboard → Create Agent → Fill form → Optionally enhance with AI → Submit

**Admin agent setup**
`/admin/agents/[id]` → Copy business details → Configure in ElevenLabs → Paste back agent ID, WhatsApp link, phone, QR → Set status to Active

**Chat monitoring**
Dashboard → Chats → View live conversation list and transcripts from ElevenLabs

---

## Pricing

| Plan | Price |
|---|---|
| Starter | ₦50,000 / month |
| Pro | ₦100,000 / month |

Pro includes voice calls, image sending, follow-up messages, and higher conversation limits.

---

## Project Structure

```
src/
├── app/
│   ├── (marketing)/        # Landing, features, pricing, how-it-works, contact
│   ├── (auth)/             # Login, signup
│   ├── dashboard/          # User dashboard (agent, chats)
│   ├── admin/              # Admin panel (users, agents)
│   └── api/                # API routes
├── components/
│   ├── ui/                 # Button, Input, Card, Badge, Modal, Spinner
│   ├── landing/            # Navbar, Hero, Globe, Features, Footer
│   ├── dashboard/          # Sidebar, AgentForm, AgentCard, ChatList
│   └── admin/              # UserTable, AgentSetupForm, CopyAllButton
├── lib/                    # auth, db, elevenlabs, openai, email, utils, validations
└── types/                  # Shared TypeScript types
```

---

## License

MIT
