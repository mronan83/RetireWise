/**
 * AES-256-GCM encryption for storing sensitive data (API keys) in the database.
 * Uses ENCRYPTION_KEY env var as the secret. Falls back to a derived key from
 * CRON_SECRET if ENCRYPTION_KEY is not set.
 */

import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;
const TAG_LENGTH = 16;

function getKey(): Buffer {
  const secret = process.env.ENCRYPTION_KEY || process.env.CRON_SECRET;
  if (!secret) throw new Error("ENCRYPTION_KEY or CRON_SECRET must be set");
  // Derive a 32-byte key from the secret using scrypt
  return scryptSync(secret, "retirewise-salt", 32);
}

/**
 * Encrypt a plaintext string. Returns a hex-encoded string containing
 * the IV + ciphertext + auth tag, safe for database storage.
 */
export function encrypt(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(plaintext, "utf8", "hex");
  encrypted += cipher.final("hex");
  const tag = cipher.getAuthTag();

  // Pack: iv (hex) + : + encrypted (hex) + : + tag (hex)
  return `${iv.toString("hex")}:${encrypted}:${tag.toString("hex")}`;
}

/**
 * Decrypt a previously encrypted string.
 */
export function decrypt(packed: string): string {
  const key = getKey();
  const [ivHex, encrypted, tagHex] = packed.split(":");

  if (!ivHex || !encrypted || !tagHex) {
    throw new Error("Invalid encrypted data format");
  }

  const iv = Buffer.from(ivHex, "hex");
  const tag = Buffer.from(tagHex, "hex");
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);

  let decrypted = decipher.update(encrypted, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

/**
 * Mask an API key for display: show first 8 and last 4 chars.
 */
export function maskKey(key: string): string {
  if (key.length <= 12) return "****";
  return `${key.slice(0, 8)}...${key.slice(-4)}`;
}
