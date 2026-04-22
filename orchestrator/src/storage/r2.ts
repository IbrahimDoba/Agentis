import {
    S3Client,
    PutObjectCommand,
    DeleteObjectCommand,
    GetObjectCommand,
} from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"
import { config } from "../config.js"
import { logger as rootLogger } from "../lib/logger.js"

const logger = rootLogger.child({ module: "r2" })

const client = new S3Client({
    region: "auto",
    endpoint: `https://${config.CLOUDFLARE_R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
        accessKeyId: config.CLOUDFLARE_R2_ACCESS_KEY_ID,
        secretAccessKey: config.CLOUDFLARE_R2_SECRET_ACCESS_KEY,
    },
})

export const BUCKET = config.CLOUDFLARE_R2_BUCKET

/**
 * Upload a file buffer to R2.
 */
export async function uploadFile(
    key: string,
    body: Buffer | Uint8Array,
    contentType: string
): Promise<void> {
    await client.send(
        new PutObjectCommand({
            Bucket: BUCKET,
            Key: key,
            Body: body,
            ContentType: contentType,
        })
    )
    logger.info({ key, contentType }, "File uploaded to R2")
}

/**
 * Delete a file from R2.
 */
export async function deleteFile(key: string): Promise<void> {
    await client.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }))
    logger.info({ key }, "File deleted from R2")
}

/**
 * Generate a pre-signed GET URL valid for `expirySeconds` (default 3600).
 */
export async function getSignedDownloadUrl(
    key: string,
    expirySeconds = 3600
): Promise<string> {
    const command = new GetObjectCommand({ Bucket: BUCKET, Key: key })
    return getSignedUrl(client, command, { expiresIn: expirySeconds })
}

/**
 * Build a public URL for a file (only useful if bucket has public access).
 */
export function publicUrl(key: string): string {
    const base = config.CLOUDFLARE_R2_PUBLIC_URL ?? ""
    return base ? `${base}/${key}` : key
}

/**
 * R2 key helpers — keep paths consistent across the app.
 */
export const r2Keys = {
    document: (agentId: string, docId: string, filename: string) =>
        `documents/${agentId}/${docId}/${filename}`,
    media: (agentId: string, mediaId: string, filename: string) =>
        `media/${agentId}/${mediaId}/${filename}`,
}
