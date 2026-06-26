import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { getResellerAdminContext } from "@/lib/resellerAdmin"
import { buildOrchestratorSystemPrompt } from "@/lib/orchestratorSync"

// Create a WhatsApp AI agent on behalf of one of the reseller's own customers.
// Mirrors the orchestrator path of POST /api/agents, except the owner is the
// target customer (strictly scoped to the reseller's tenant) rather than the
// caller. The reseller is deliberately provisioning, so if the customer is at
// their agent cap we lift it instead of blocking — she manages her own tenant.

// Knowledge fields the reseller may set at creation. Mirrors the editable set
// on /api/reseller/agents/[id].
const TEXT_FIELDS = [
  "businessDescription", "productsServices", "faqs", "operatingHours",
  "contactEmail", "contactPhone", "websiteLinks", "responseGuidelines",
] as const

export async function POST(req: NextRequest) {
  const ctx = await getResellerAdminContext()
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const userId = typeof body.userId === "string" ? body.userId : ""
  if (!userId) return NextResponse.json({ error: "Missing customer" }, { status: 400 })

  const businessName = typeof body.businessName === "string" ? body.businessName.trim() : ""
  if (businessName.length < 2) {
    return NextResponse.json({ error: "Business name must be at least 2 characters" }, { status: 400 })
  }

  // The target must be one of THIS reseller's users — a stale/foreign id finds
  // nothing, so a reseller can never provision into another tenant.
  const customer = await db.user.findFirst({
    where: { id: userId, resellerId: ctx.resellerId },
    select: { id: true, maxAgents: true, _count: { select: { agents: true } } },
  })
  if (!customer) return NextResponse.json({ error: "Customer not found" }, { status: 404 })

  // Collect the optional knowledge fields that were actually provided.
  const fields: Record<string, string> = {}
  for (const f of TEXT_FIELDS) {
    if (typeof body[f] === "string" && body[f].trim() !== "") fields[f] = body[f]
  }

  // Provisioning lifts the customer's cap rather than blocking the reseller.
  const newCount = customer._count.agents + 1
  if (customer.maxAgents < newCount) {
    await db.user.update({ where: { id: customer.id }, data: { maxAgents: newCount } })
  }

  const agent = await db.agent.create({
    data: {
      // Required, non-default text columns — default to empty like POST /api/agents.
      businessDescription: "",
      productsServices: "",
      faqs: "",
      operatingHours: "",
      ...fields,
      businessName,
      userId: customer.id,
      // DZero AI (orchestrator) WhatsApp agent — same shape the dashboard creates.
      agentRuntime: "orchestrator",
      status: "ACTIVE",
      transportType: "baileys",
    },
  })

  await db.orchestratorAgent.create({
    data: {
      agentId: agent.id,
      name: agent.businessName,
      systemPrompt: buildOrchestratorSystemPrompt(fields.responseGuidelines),
      model: "gpt-4o-mini",
      temperature: 0.7,
      maxOutputTokens: 800,
    },
  })

  return NextResponse.json({ ok: true, agentId: agent.id }, { status: 201 })
}
