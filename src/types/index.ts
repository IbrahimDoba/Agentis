export type Role = "USER" | "ADMIN"
export type UserStatus = "PENDING" | "APPROVED" | "REJECTED"
export type AgentStatus = "PENDING_REVIEW" | "SETTING_UP" | "ACTIVE" | "INACTIVE"

export interface UserPublic {
  id: string
  name: string
  email: string
  phone: string
  businessName: string
  role: Role
  status: UserStatus
  createdAt: string
}

export interface AgentPublic {
  id: string
  userId: string
  businessName: string
  businessDescription: string
  productsServices: string
  faqs: string
  operatingHours: string
  websiteLinks?: string
  responseGuidelines?: string
  profileImageUrl?: string
  whatsappBusinessName?: string
  whatsappAgentLink?: string
  whatsappPhoneNumber?: string
  qrCodeUrl?: string
  elevenlabsAgentId?: string
  status: AgentStatus
  createdAt: string
  updatedAt: string
  user?: UserPublic
}

export interface Conversation {
  conversation_id: string
  agent_id: string
  start_time_unix_secs: number
  call_duration_secs: number
  status: string
  transcript?: TranscriptMessage[]
}

export interface TranscriptMessage {
  role: "user" | "agent"
  message: string
  time_in_call_secs: number
}
