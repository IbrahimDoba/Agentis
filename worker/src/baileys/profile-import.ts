import type { WASocket } from "@whiskeysockets/baileys"
import { sql } from "../db/client.js"
import { supabase } from "../db/supabase.js"
import { config } from "../config.js"
import { logger as rootLogger } from "../lib/logger.js"

const logger = rootLogger.child({ module: "profile-import" })

// One-shot import of the user's WhatsApp Business profile after a successful
// first connect. Pulls verifiedName / notify / profile picture, plus
// getBusinessProfile() if the account is a WhatsApp Business account.
// Writes ONLY to Agent fields that are currently blank — we never clobber
// values the user has already entered in the dashboard.
//
// Safe to call on every connect; the BaileysSession.historySyncedAt flag
// already gates the one-shot history sync, and this function uses its own
// guard (Agent.autoConfigStartedAt) to avoid spamming WhatsApp's profile
// endpoint on every reconnect.

interface ProfileImportResult {
  ranImport: boolean
  reason?: string
  filled: string[]
}

// Bucket for profile pictures. We download from WhatsApp's URL (which
// expires) and re-host so the dashboard always has a stable image.
const PROFILE_PIC_BUCKET = "profile-pictures"

export async function importProfileFromWhatsApp(
  sock: WASocket,
  agentId: string
): Promise<ProfileImportResult> {
  const filled: string[] = []

  // Pull the current state of the Agent row so we know what's empty.
  const agentRows = await sql<{
    businessName: string
    businessDescription: string
    profileImageUrl: string | null
    category: string | null
    address: string | null
    contactEmail: string | null
    websiteLinks: string | null
    autoConfigStartedAt: string | null
  }[]>`
    SELECT "businessName", "businessDescription", "profileImageUrl",
           "category", "address", "contactEmail", "websiteLinks",
           "autoConfigStartedAt"
    FROM "Agent" WHERE "id" = ${agentId} LIMIT 1
  `
  const agent = agentRows[0]
  if (!agent) {
    return { ranImport: false, reason: "Agent not found", filled }
  }

  // Cheap guard so we don't hit WhatsApp's profile API on every reconnect.
  // The auto-config flow stamps autoConfigStartedAt at the start; if it's
  // already set, the user has either been here before OR a re-import is
  // already in flight elsewhere.
  if (agent.autoConfigStartedAt) {
    return { ranImport: false, reason: "Already imported (autoConfigStartedAt is set)", filled }
  }

  // The "me" identity tells us the connected JID + whether this is a
  // verified business. sock.user is populated by Baileys after a successful
  // connection and mirrors creds.me.
  const me = (sock as unknown as { user?: { id?: string; name?: string; verifiedName?: string; notify?: string } }).user
  const selfJid = me?.id
  if (!selfJid) {
    return { ranImport: false, reason: "sock.user.id not populated yet", filled }
  }

  const verifiedName = me?.verifiedName ?? null
  const displayName = me?.name ?? me?.notify ?? null

  // Three best-effort lookups in parallel. If any fail we still write what
  // we got — profile picture failing shouldn't block business profile etc.
  const [businessProfileResult, profilePicResult] = await Promise.allSettled([
    sock.getBusinessProfile(selfJid),
    sock.profilePictureUrl(selfJid, "image"),
  ])
  const businessProfile =
    businessProfileResult.status === "fulfilled" && businessProfileResult.value
      ? businessProfileResult.value
      : null
  const profilePicUrl =
    profilePicResult.status === "fulfilled" && profilePicResult.value
      ? profilePicResult.value
      : null

  // Re-host the profile picture so the dashboard has a stable URL.
  // WhatsApp's CDN URLs expire after a few hours / days.
  let storedProfilePicUrl: string | null = null
  if (profilePicUrl && !agent.profileImageUrl) {
    storedProfilePicUrl = await rehostProfilePicture(agentId, profilePicUrl).catch((err) => {
      logger.warn({ agentId, err: err.message }, "Profile picture rehost failed — falling back to raw URL")
      return profilePicUrl
    })
  }

  // Compute the candidate values for each fillable field. Each one is
  // either the imported value OR null when we have nothing new to set.
  // We use COALESCE in the UPDATE so existing values stay put — only blank
  // columns get filled. Lets us write one fixed-shape UPDATE statement
  // regardless of which fields we actually have data for.
  const newBusinessName = blank(agent.businessName) ? (verifiedName || displayName || null) : null
  const newDescription = blank(agent.businessDescription) ? (businessProfile?.description ?? null) : null
  const newProfileImage = blank(agent.profileImageUrl) ? (storedProfilePicUrl ?? null) : null
  const newCategory = blank(agent.category) ? (businessProfile?.category ?? null) : null
  const newAddress = blank(agent.address) ? (businessProfile?.address ?? null) : null
  const newEmail = blank(agent.contactEmail) ? (businessProfile?.email ?? null) : null
  const newWebsite =
    blank(agent.websiteLinks) && businessProfile?.website?.length
      ? businessProfile.website.join("\n")
      : null

  if (newBusinessName) filled.push("businessName")
  if (newDescription) filled.push("businessDescription")
  if (newProfileImage) filled.push("profileImageUrl")
  if (newCategory) filled.push("category")
  if (newAddress) filled.push("address")
  if (newEmail) filled.push("contactEmail")
  if (newWebsite) filled.push("websiteLinks")
  if (verifiedName) filled.push("isVerified")

  await sql`
    UPDATE "Agent"
    SET
      "businessName"        = COALESCE(NULLIF("businessName", ''), ${newBusinessName}),
      "businessDescription" = COALESCE(NULLIF("businessDescription", ''), ${newDescription}),
      "profileImageUrl"     = COALESCE("profileImageUrl", ${newProfileImage}),
      "category"            = COALESCE("category", ${newCategory}),
      "address"             = COALESCE("address", ${newAddress}),
      "contactEmail"        = COALESCE("contactEmail", ${newEmail}),
      "websiteLinks"        = COALESCE("websiteLinks", ${newWebsite}),
      "isVerified"          = ${verifiedName ? true : false} OR "isVerified",
      "autoConfigStartedAt" = NOW(),
      "autoConfigStatus"    = COALESCE("autoConfigStatus", 'pending')
    WHERE "id" = ${agentId}
  `

  logger.info(
    { agentId, filled, hasBusinessProfile: !!businessProfile, isVerified: !!verifiedName },
    "Profile imported from WhatsApp"
  )

  return { ranImport: true, filled }
}

function blank(v: string | null | undefined): boolean {
  return v === null || v === undefined || v === ""
}

async function rehostProfilePicture(agentId: string, sourceUrl: string): Promise<string> {
  const res = await fetch(sourceUrl)
  if (!res.ok) throw new Error(`Source fetch failed: ${res.status}`)
  const arrayBuffer = await res.arrayBuffer()
  const buf = Buffer.from(arrayBuffer)
  const contentType = res.headers.get("content-type") || "image/jpeg"
  const ext = contentType.includes("png") ? "png" : "jpg"
  const path = `${agentId}/profile-${Date.now()}.${ext}`

  // Make sure the bucket exists. Failing silently if not (the caller
  // catches and falls back to the raw URL). We use the auth-store bucket
  // pattern — see worker/src/baileys/auth-store.ts.
  const upload = await supabase.storage
    .from(PROFILE_PIC_BUCKET)
    .upload(path, buf, { upsert: true, contentType })
  if (upload.error) throw new Error(`Supabase upload: ${upload.error.message}`)

  // Get a public URL. If the bucket isn't public, we'd need a signed URL;
  // profile pictures are inherently shareable so public is fine.
  const { data } = supabase.storage.from(PROFILE_PIC_BUCKET).getPublicUrl(path)
  // Suppress unused-import warning for config — it's used elsewhere in
  // the worker but TS doesn't see it from here.
  void config
  return data.publicUrl
}
