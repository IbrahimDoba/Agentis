import { z } from "zod"

// External Developer API key creation. scopes must be a non-empty subset of the
// allowed scopes; the daily cap is optional (null/omitted = no cap).
export const createApiKeySchema = z.object({
  name: z.string().min(1, "Name is required").max(60, "Max 60 characters"),
  scopes: z.array(z.enum(["chat", "manage", "messages"])).min(1, "Select at least one scope"),
  dailySpendingCapCredits: z.number().int().positive("Must be a positive number").nullable().optional(),
})

// Surface B: replace an agent's webhook tools via the developer API.
const apiToolParameterSchema = z.object({
  name: z.string().min(1, "Parameter name is required"),
  type: z.enum(["string", "integer", "boolean", "number"]),
  description: z.string().default(""),
  required: z.boolean().default(false),
  enum: z.array(z.string()).optional(),
})

const apiAgentToolSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1, "Tool name is required"),
  displayName: z.string().optional(),
  description: z.string().default(""),
  url: z.string().url("Tool url must be a valid URL"),
  method: z.enum(["GET", "POST"]),
  parameters: z.array(apiToolParameterSchema).default([]),
  // Optional outbound request headers (e.g. an Authorization token the tool's
  // API requires). Preserved so the orchestrator can authenticate the call.
  headers: z.record(z.string(), z.string()).optional(),
})

export const apiSetToolsSchema = z.object({
  tools: z.array(apiAgentToolSchema).max(50, "Max 50 tools"),
})

export const signupSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  email: z.string().email("Invalid email address"),
  businessName: z.string().min(2, "Business name required"),
  phone: z.string().min(7, "Invalid phone number").optional().or(z.literal("")),
  password: z.string().min(8, "Password must be at least 8 characters"),
  // Optional "how did you hear about us?" — free-form string capped for safety.
  referralSource: z.string().max(100).optional().or(z.literal("")),
  // Machine attribution. The dz_attr cookie set by /r/<token> is the primary
  // path; these are the fallback for when it is missing (Safari ITP, or a URL
  // copied to another device). Bounded so a crafted URL cannot bloat a row.
  utmSource: z.string().max(64).optional(),
  utmMedium: z.string().max(64).optional(),
  utmCampaign: z.string().max(64).optional(),
  landingPath: z.string().max(256).optional(),
})

export const profileUpdateSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  phone: z.string().min(7, "Invalid phone number").optional().or(z.literal("")),
  notifyWhatsappNumber: z.string().min(7, "Invalid WhatsApp number").optional().or(z.literal("")),
  businessName: z.string().min(2, "Business name required"),
  businessCategory: z.string().optional(),
  businessDescription: z.string().max(512, "Max 512 characters").optional(),
  businessAddress: z.string().max(256, "Max 256 characters").optional(),
  businessEmail: z.string().email("Invalid email").optional().or(z.literal("")),
  businessWebsite: z.string().max(256, "Max 256 characters").optional(),
})

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1, "Password required"),
  // The login form (served on the tenant's domain) passes its own host so
  // authorize() can resolve the reseller and look the user up per-tenant.
  domain: z.string().optional(),
})

export const accountPasswordSchema = z.object({
  currentPassword: z.string().optional(),
  newPassword: z.string().min(8, "Password must be at least 8 characters"),
})

export const agentSchema = z.object({
  businessName: z.string().min(2, "Business name must be at least 2 characters").optional(),
  businessDescription: z.string().optional(),
  contactEmail: z.string().email("Enter a valid contact email address").optional().or(z.literal("")),
  contactPhone: z.string().optional(),
  productsServices: z.string().optional(),
  faqs: z.string().optional(),
  operatingHours: z.string().optional(),
  websiteLinks: z.string().optional(),
  responseGuidelines: z.string().optional(),
  profileImageUrl: z.string().optional(),
  whatsappBusinessName: z.string().optional(),
  category: z.string().optional(),
  address: z.string().optional(),
  aiRepliesEnabled: z.boolean().optional(),
  groupChatEnabled: z.boolean().optional(),
  replyGuardEnabled: z.boolean().optional(),
  productAlbumEnabled: z.boolean().optional(),
  productAlbumTitle: z.string().max(700).optional(),
  leadCriteria: z.string().max(2000).optional(),
  handoffCriteria: z.string().max(2000).optional(),
  chatTaggingEnabled: z.boolean().optional(),
  backgroundTaggingEnabled: z.boolean().optional(),
  autoPauseOnHumanReply: z.boolean().optional(),
  pauseOnAiHandoff: z.boolean().optional(),
  pauseOnQualifiedLead: z.boolean().optional(),
  // Minutes of inactivity before a human-mode chat auto-resumes to AI. null = off.
  autoResumeAiAfterMinutes: z.coerce.number().int().min(0).max(1440).nullable().optional(),
  // Seconds to wait before replying; also the window in which rapid messages are
  // batched into one reply. 0 = instant. Capped at 60s to bound the queue delay.
  replyDelaySeconds: z.coerce.number().int().min(0).max(60).optional(),
  agentRuntime: z.enum(["elevenlabs", "orchestrator"]).optional(),
  productsData: z.array(z.object({
    id: z.string(),
    name: z.string(),
    description: z.string().optional(),
    price: z.string().optional(),
    link: z.string().optional(),
    imageUrl: z.string().optional(),
    images: z.array(z.string()).optional(),
    mediaId: z.string().optional(),
  })).optional(),
  // Orchestrator-specific fields
  orchestratorModel: z.string().optional(),
  orchestratorTemperature: z.coerce.number().min(0).max(2).optional(),
  orchestratorMaxTokens: z.coerce.number().min(100).max(4096).optional(),
})

export const adminAgentUpdateSchema = z.object({
  whatsappAgentLink: z.string().optional(),
  whatsappPhoneNumber: z.string().optional(),
  whatsappPhoneNumberId: z.string().optional(),
  qrCodeUrl: z.string().optional(),
  elevenlabsAgentId: z.string().optional(),
  status: z.enum(["PENDING_REVIEW", "SETTING_UP", "ACTIVE", "INACTIVE"]).optional(),
})

export const demoSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  email: z.string().email("Enter a valid email address"),
  businessName: z.string().min(2, "Business name must be at least 2 characters"),
  preferredDate: z.string().min(1, "Please select a preferred date"),
  preferredTime: z.string().min(1, "Please select a preferred time"),
  message: z.string().optional(),
})

export type SignupInput = z.infer<typeof signupSchema>
export type LoginInput = z.infer<typeof loginSchema>
export type AccountPasswordInput = z.infer<typeof accountPasswordSchema>
export type AgentInput = z.infer<typeof agentSchema>
export type AdminAgentUpdateInput = z.infer<typeof adminAgentUpdateSchema>
export type DemoInput = z.infer<typeof demoSchema>
export type ProfileUpdateInput = z.infer<typeof profileUpdateSchema>
