/**
 * Patches src/generated/prisma/models/Message.ts to include the senderRole field.
 * Workaround for a Prisma v7 generator bug where new fields are not reflected in
 * the modular models/*.ts files even after `prisma generate`.
 * Runs automatically as part of the build script.
 */

const fs = require("fs")
const path = require("path")

const file = path.join(__dirname, "../src/generated/prisma/models/Message.ts")

if (!fs.existsSync(file)) {
  console.log("patch-prisma: Message.ts not found (non-Next.js build), skipping.")
  process.exit(0)
}

let content = fs.readFileSync(file, "utf8")

if (content.includes("senderRole")) {
  console.log("patch-prisma: Message.ts already patched, skipping.")
  process.exit(0)
}

// MessageSelect
content = content.replace(
  "  id?: boolean\n  conversationId?: boolean\n  direction?: boolean\n  content?: boolean\n  mediaUrl?: boolean\n  mediaDescription?: boolean\n  toolCalls?: boolean\n  tokensInput?: boolean\n  tokensOutput?: boolean\n  modelUsed?: boolean\n  createdAt?: boolean\n  conversation?: boolean",
  "  id?: boolean\n  conversationId?: boolean\n  direction?: boolean\n  senderRole?: boolean\n  content?: boolean\n  mediaUrl?: boolean\n  mediaDescription?: boolean\n  toolCalls?: boolean\n  tokensInput?: boolean\n  tokensOutput?: boolean\n  modelUsed?: boolean\n  createdAt?: boolean\n  conversation?: boolean"
)

// MessageSelectScalar
content = content.replace(
  "export type MessageSelectScalar = {\n  id?: boolean\n  conversationId?: boolean\n  direction?: boolean\n  content?: boolean",
  "export type MessageSelectScalar = {\n  id?: boolean\n  conversationId?: boolean\n  direction?: boolean\n  senderRole?: boolean\n  content?: boolean"
)

// MessageOmit union string
content = content.replace(
  '"id" | "conversationId" | "direction" | "content"',
  '"id" | "conversationId" | "direction" | "senderRole" | "content"'
)

// MessageCreateInput
content = content.replace(
  "export type MessageCreateInput = {\n  id?: string\n  direction: string\n  content: string",
  "export type MessageCreateInput = {\n  id?: string\n  direction: string\n  senderRole?: string\n  content: string"
)

// MessageUncheckedCreateInput
content = content.replace(
  "export type MessageUncheckedCreateInput = {\n  id?: string\n  conversationId: string\n  direction: string\n  content: string",
  "export type MessageUncheckedCreateInput = {\n  id?: string\n  conversationId: string\n  direction: string\n  senderRole?: string\n  content: string"
)

fs.writeFileSync(file, content)
console.log("patch-prisma: Message.ts patched successfully.")
