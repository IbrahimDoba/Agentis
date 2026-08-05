export type Role = "USER" | "ADMIN" | "RESELLER_ADMIN"
export type UserStatus = "PENDING" | "APPROVED" | "REJECTED" | "SUSPENDED"
export type AgentStatus = "PENDING_REVIEW" | "SETTING_UP" | "ACTIVE" | "INACTIVE"

export interface UserPublic {
  id: string
  name: string
  email: string
  phone?: string | null
  businessName: string
  role: Role
  status: UserStatus
  resellerId: string
  createdAt: string
  businessCategory?: string | null
  businessDescription?: string | null
  businessAddress?: string | null
  businessEmail?: string | null
  businessWebsite?: string | null
  maxAgents?: number
  plan?: string
  subscriptionExpiresAt?: string | null
  onboardingCompleted?: boolean
  referralsEnabled?: boolean
  developerModeEnabled?: boolean
  leadNotificationsEnabled?: boolean
  appointmentReminder1Minutes?: number
  appointmentReminder2Minutes?: number | null
  hasPassword?: boolean
}

export interface ToolParameter {
  name: string
  type: "string" | "integer" | "boolean" | "number"
  description: string
  required: boolean
  enum?: string[]
}

export interface AgentTool {
  id: string
  name: string
  displayName: string
  description: string
  url: string
  method: "GET" | "POST"
  parameters: ToolParameter[]
  // Custom request headers sent on every outbound call to this tool — e.g.
  // { Authorization: "Bearer <token>" } so the endpoint can authenticate us.
  headers?: Record<string, string>
}

export interface Product {
  id: string
  name: string
  description?: string
  price?: string
  link?: string
  // Cover photo — kept in sync with images[0]. Retained for backward
  // compatibility (catalogue album, text sync, single-image send all read it).
  imageUrl?: string
  // All photos of this product (different angles). images[0] is the cover.
  // The AI sends these as a per-product album when a customer asks about it.
  images?: string[]
  mediaId?: string
  // ── WhatsApp catalogue sync ──────────────────────────────────────────────
  // Where this product came from. "whatsapp" = pulled from the connected
  // number's WhatsApp Business catalogue; undefined/"manual" = added in
  // Dailzero. A sync only ever touches "whatsapp" products — manual ones are
  // never overwritten.
  source?: "whatsapp" | "manual"
  // Operator's own SKU on WhatsApp — the stable key we re-sync on (may be empty
  // if they never set SKUs, in which case waProductId is the fallback key).
  retailerId?: string
  // WhatsApp's internal product id — stable fallback merge key.
  waProductId?: string
}

export interface AgentPublic {
  id: string
  userId: string
  businessName: string
  businessDescription: string
  productsServices: string
  faqs: string
  operatingHours: string
  contactEmail?: string
  contactPhone?: string
  websiteLinks?: string
  responseGuidelines?: string
  profileImageUrl?: string
  whatsappBusinessName?: string
  whatsappAgentLink?: string
  whatsappPhoneNumber?: string
  qrCodeUrl?: string
  elevenlabsAgentId?: string
  agentRuntime?: string
  messagingEnabled?: boolean
  aiRepliesEnabled?: boolean
  replyGuardEnabled?: boolean
  autoPauseOnHumanReply?: boolean
  pauseOnAiHandoff?: boolean
  pauseOnQualifiedLead?: boolean
  autoResumeAiAfterMinutes?: number | null
  replyDelaySeconds?: number
  isVerified?: boolean
  autoConfigStatus?: string | null
  category?: string | null
  address?: string | null
  productsData?: Product[] | null
  productAlbumEnabled?: boolean
  productAlbumTitle?: string | null
  toolsData?: AgentTool[] | null
  status: AgentStatus
  createdAt: string
  updatedAt: string
  user?: UserPublic
}

export interface ConversationMeta {
  /** Phone number of the person who initiated the conversation (WhatsApp / voice) */
  caller_id?: string
  phone_call?: {
    external_number?: string
    from?: string
    to?: string
  }
  /** WhatsApp-specific sender number */
  from_number?: string
  initiator_identifier?: string
  [key: string]: unknown
}

export interface Conversation {
  conversation_id: string
  agent_id: string
  agent_name?: string
  user_id?: string | null
  start_time_unix_secs: number
  call_duration_secs: number
  message_count: number
  status: "initiated" | "in-progress" | "processing" | "done" | "failed" | string
  call_successful: "success" | "failure" | "unknown"
  // Available when summary_mode=include
  call_summary_title?: string | null
  transcript_summary?: string | null
  main_language?: string | null
  conversation_initiation_source?: string | null
  direction?: "inbound" | "outbound" | null
  rating?: number | null
  tool_names?: string[]
  metadata?: ConversationMeta
  transcript?: TranscriptMessage[]
  creditsUsed?: number
}

export interface TranscriptMessage {
  role: "user" | "agent"
  message: string | null
  time_in_call_secs: number
  source_medium?: string
  audio_url?: string
  image_url?: string
  video_url?: string
  document_url?: string
  document_name?: string
}
