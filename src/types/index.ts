export type Role = "USER" | "ADMIN"
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
}

export interface Product {
  id: string
  name: string
  description?: string
  price?: string
  link?: string
  imageUrl?: string
  mediaId?: string
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
  category?: string | null
  address?: string | null
  productsData?: Product[] | null
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
