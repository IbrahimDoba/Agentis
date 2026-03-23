import { z } from "zod"

export const signupSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  email: z.string().email("Invalid email address"),
  businessName: z.string().min(2, "Business name required"),
  password: z.string().min(8, "Password must be at least 8 characters"),
})

export const profileUpdateSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  phone: z.string().min(7, "Invalid phone number").optional().or(z.literal("")),
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
})

export const agentSchema = z.object({
  businessName: z.string().min(2),
  businessDescription: z.string().min(20, "Please describe your business (min 20 chars)"),
  contactEmail: z.string().email("Enter a valid contact email"),
  contactPhone: z.string().min(7, "Enter a valid contact phone number"),
  productsServices: z.string().min(10),
  faqs: z.string().min(10),
  operatingHours: z.string().min(3),
  websiteLinks: z.string().optional(),
  responseGuidelines: z.string().optional(),
  profileImageUrl: z.string().optional(),
  whatsappBusinessName: z.string().optional(),
})

export const adminAgentUpdateSchema = z.object({
  whatsappAgentLink: z.string().optional(),
  whatsappPhoneNumber: z.string().optional(),
  qrCodeUrl: z.string().optional(),
  elevenlabsAgentId: z.string().optional(),
  status: z.enum(["PENDING_REVIEW", "SETTING_UP", "ACTIVE", "INACTIVE"]).optional(),
})

export const demoSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  businessName: z.string().min(2),
  preferredDate: z.string(),
  preferredTime: z.string(),
  message: z.string().optional(),
})

export type SignupInput = z.infer<typeof signupSchema>
export type LoginInput = z.infer<typeof loginSchema>
export type AgentInput = z.infer<typeof agentSchema>
export type AdminAgentUpdateInput = z.infer<typeof adminAgentUpdateSchema>
export type DemoInput = z.infer<typeof demoSchema>
export type ProfileUpdateInput = z.infer<typeof profileUpdateSchema>
