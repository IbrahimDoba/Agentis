import { graphGet, graphPost, graphDelete } from "./graph"

// Read-only Graph calls that exercise the `whatsapp_business_management`
// permission, separate from the messaging path in cloud-api.ts. Meta's app
// review expects every requested permission to be demonstrated on camera, so
// the harness surfaces the WABA, its numbers, and its templates in one panel.
// (A business_management module lived alongside this one until that permission
// was dropped from the App Review submission — see git history.)

export interface BusinessAccount {
  id: string
  name: string
  timezoneId: string | null
}

export interface ManagedPhoneNumber {
  id: string
  displayPhoneNumber: string
  verifiedName: string
  qualityRating: string | null
  verificationStatus: string | null
}

export interface MessageTemplate {
  id: string
  name: string
  status: string
  category: string
  language: string
}

export interface BusinessOverview {
  account: BusinessAccount
  phoneNumbers: ManagedPhoneNumber[]
  templates: MessageTemplate[]
}

function getWabaId(): string {
  const wabaId = process.env.META_TEST_WABA_ID
  if (!wabaId) throw new Error("Missing Meta env var: META_TEST_WABA_ID")
  return wabaId
}

// Fetches the three management views in parallel — one round trip's latency
// instead of three, which matters when the panel polls alongside the chat feed.
export async function getBusinessOverview(): Promise<BusinessOverview> {
  const wabaId = getWabaId()

  const [account, numbers, templates] = await Promise.all([
    graphGet<{ id: string; name: string; timezone_id?: string }>(
      wabaId,
      "id,name,timezone_id"
    ),
    graphGet<{ data?: Array<Record<string, string>> }>(
      `${wabaId}/phone_numbers`,
      "id,display_phone_number,verified_name,quality_rating,code_verification_status"
    ),
    graphGet<{ data?: Array<Record<string, string>> }>(
      `${wabaId}/message_templates`,
      "id,name,status,category,language"
    ),
  ])

  return {
    account: {
      id: account.id,
      name: account.name,
      timezoneId: account.timezone_id ?? null,
    },
    phoneNumbers: (numbers.data ?? []).map((n) => ({
      id: n.id,
      displayPhoneNumber: n.display_phone_number,
      verifiedName: n.verified_name,
      qualityRating: n.quality_rating ?? null,
      verificationStatus: n.code_verification_status ?? null,
    })),
    templates: (templates.data ?? []).map((t) => ({
      id: t.id,
      name: t.name,
      status: t.status,
      category: t.category,
      language: t.language,
    })),
  }
}

export type TemplateCategory = "UTILITY" | "MARKETING"

export interface CreateTemplateInput {
  name: string
  category: TemplateCategory
  language: string
  body: string
}

export interface CreatedTemplate {
  id: string
  status: string
  category: string
}

// Meta's rule: lowercase alphanumerics and underscores only. Callers pass
// human input, so normalise rather than reject — "Order Update" becomes
// "order_update" instead of a validation error the user has to decode.
export function normalizeTemplateName(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9_\s]/g, "")
    .trim()
    .replace(/\s+/g, "_")
    .slice(0, 512)
}

// Creates a body-only template on the WABA. Meta queues it for review, so the
// returned status is normally PENDING — approval lands minutes to hours later
// and shows up in the template list.
export async function createMessageTemplate(
  input: CreateTemplateInput,
  // The WABA to create on, and its credentials. Templates belong to a customer's
  // account, so these are always explicit.
  target: { wabaId: string; accessToken: string }
): Promise<CreatedTemplate> {
  const created = await graphPost<{ id: string; status?: string; category?: string }>(
    `${target.wabaId}/message_templates`,
    {
      name: normalizeTemplateName(input.name),
      category: input.category,
      language: input.language,
      components: [{ type: "BODY", text: input.body }],
    },
    { accessToken: target.accessToken }
  )

  return {
    id: created.id,
    status: created.status ?? "PENDING",
    category: created.category ?? input.category,
  }
}

// ---------------------------------------------------------------------------
// Template management
//
// Templates belong to a customer's WABA, so every call here takes explicit
// credentials rather than reading env — one customer must never see or delete
// another's templates.

export interface TemplateListItem {
  id: string
  name: string
  status: string
  category: string
  language: string
  /** Meta's quality signal; null until the template has been sent enough. */
  qualityScore: string | null
  /** Present when status is REJECTED — the reason, for the operator to act on. */
  rejectedReason: string | null
  /** The BODY text, so the list is useful without opening each one. */
  body: string | null
}

export interface TemplatePage {
  templates: TemplateListItem[]
  /** Cursor for the next page; null when this is the last. */
  after: string | null
}

interface RawTemplate {
  id: string
  name: string
  status: string
  category: string
  language: string
  quality_score?: { score?: string }
  rejected_reason?: string
  components?: Array<{ type?: string; text?: string }>
}

function toListItem(t: RawTemplate): TemplateListItem {
  const body = t.components?.find((c) => c.type?.toUpperCase() === "BODY")?.text ?? null
  return {
    id: t.id,
    name: t.name,
    status: t.status,
    category: t.category,
    language: t.language,
    qualityScore: t.quality_score?.score ?? null,
    // Meta returns "NONE" rather than omitting the field for approved templates.
    rejectedReason:
      t.rejected_reason && t.rejected_reason !== "NONE" ? t.rejected_reason : null,
    body,
  }
}

export async function listTemplates(
  wabaId: string,
  accessToken: string,
  after?: string | null
): Promise<TemplatePage> {
  const res = await graphGet<{
    data?: RawTemplate[]
    paging?: { cursors?: { after?: string }; next?: string }
  }>(
    `${wabaId}/message_templates`,
    "id,name,status,category,language,quality_score,rejected_reason,components",
    {
      accessToken,
      params: { limit: "50", ...(after ? { after } : {}) },
    }
  )

  return {
    templates: (res.data ?? []).map(toListItem),
    // Only treat the cursor as a next page when Meta says there is one —
    // `cursors.after` is present even on the last page.
    after: res.paging?.next ? (res.paging.cursors?.after ?? null) : null,
  }
}

// Meta deletes by NAME, and deletes every language variant sharing it.
export async function deleteTemplate(
  wabaId: string,
  accessToken: string,
  name: string
): Promise<void> {
  await graphDelete(`${wabaId}/message_templates`, { name }, { accessToken })
}
