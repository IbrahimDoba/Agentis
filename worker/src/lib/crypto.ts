import { createCipheriv, createDecipheriv, randomBytes, timingSafeEqual } from "crypto"
import { config } from "../config.js"

const ALGORITHM = "aes-256-gcm"
const IV_LENGTH = 12
const TAG_LENGTH = 16

function getKey(): Buffer {
  const raw = Buffer.from(config.AUTH_ENCRYPTION_KEY, "base64")
  if (raw.length !== 32) throw new Error("AUTH_ENCRYPTION_KEY must be exactly 32 bytes (base64-encoded)")
  return raw
}

/**
 * Encrypt arbitrary data (Buffer or string) with AES-256-GCM.
 * Returns a single Buffer: [iv (12)] + [authTag (16)] + [ciphertext]
 */
export function encrypt(plaintext: Buffer | string): Buffer {
  const key = getKey()
  const iv = randomBytes(IV_LENGTH)
  const cipher = createCipheriv(ALGORITHM, key, iv)
  const input = Buffer.isBuffer(plaintext) ? plaintext : Buffer.from(plaintext, "utf8")
  const encrypted = Buffer.concat([cipher.update(input), cipher.final()])
  const tag = cipher.getAuthTag()
  return Buffer.concat([iv, tag, encrypted])
}

/**
 * Decrypt a Buffer produced by `encrypt`.
 */
export function decrypt(data: Buffer): Buffer {
  const key = getKey()
  const iv = data.subarray(0, IV_LENGTH)
  const tag = data.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH)
  const ciphertext = data.subarray(IV_LENGTH + TAG_LENGTH)
  const decipher = createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(ciphertext), decipher.final()])
}

/**
 * Timing-safe comparison for API keys.
 */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  return timingSafeEqual(Buffer.from(a), Buffer.from(b))
}
