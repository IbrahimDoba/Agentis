import { createCipheriv, createDecipheriv, randomBytes } from "crypto"

// AES-256-GCM for business tokens at rest, mirroring worker/src/lib/crypto.ts.
// Separate key (META_TEST_ENCRYPTION_KEY) so the harness never needs the
// worker's AUTH_ENCRYPTION_KEY — the two blast radii stay independent.

const ALGORITHM = "aes-256-gcm"
const IV_LENGTH = 12
const TAG_LENGTH = 16

function getKey(): Buffer {
  const raw = Buffer.from(process.env.META_TEST_ENCRYPTION_KEY ?? "", "base64")
  if (raw.length !== 32) {
    throw new Error("META_TEST_ENCRYPTION_KEY must be exactly 32 bytes (base64-encoded)")
  }
  return raw
}

// Returns [iv (12)] + [authTag (16)] + [ciphertext]. Plain Uint8Array rather
// than Buffer because Prisma's Bytes field rejects Buffer<ArrayBufferLike>.
export function encryptToken(plaintext: string): Uint8Array<ArrayBuffer> {
  const iv = randomBytes(IV_LENGTH)
  const cipher = createCipheriv(ALGORITHM, getKey(), iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()])
  return new Uint8Array(Buffer.concat([iv, cipher.getAuthTag(), encrypted]))
}

export function decryptToken(input: Uint8Array): string {
  const data = Buffer.from(input)
  const iv = data.subarray(0, IV_LENGTH)
  const tag = data.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH)
  const ciphertext = data.subarray(IV_LENGTH + TAG_LENGTH)
  const decipher = createDecipheriv(ALGORITHM, getKey(), iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8")
}
