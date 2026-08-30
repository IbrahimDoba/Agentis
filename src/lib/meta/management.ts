import { graphGet } from "./graph"

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
