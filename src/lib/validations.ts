import { z } from "zod"

export const signupSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  email: z.string().email("Invalid email address"),
  businessName: z.string().min(2, "Business name required"),
  phone: z.string().min(7, "Invalid phone number").optional().or(z.literal("")),
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
  productsData: z.array(z.object({
    id: z.string(),
    name: z.string(),
    description: z.string().optional(),
    price: z.string().optional(),
    link: z.string().optional(),
    imageUrl: z.string().optional(),
  })).optional(),
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
export type AgentInput = z.infer<typeof agentSchema>
export type AdminAgentUpdateInput = z.infer<typeof adminAgentUpdateSchema>
export type DemoInput = z.infer<typeof demoSchema>
export type ProfileUpdateInput = z.infer<typeof profileUpdateSchema>
