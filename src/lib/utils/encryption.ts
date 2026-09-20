/**
 * AES-256-GCM encryption for storing sensitive data (API keys) in the database.
 * Uses ENCRYPTION_KEY env var as the secret. Falls back to a derived key from
 * CRON_SECRET if ENCRYPTION_KEY is not set.
 */

import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "crypto";
import { parseVersion, tryKeys, withVersion } from "@/lib/crypto/keyring";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;
const TAG_LENGTH = 16;

function derive(secret: string): Buffer {
  // Derive a 32-byte key from the secret using scrypt
  return scryptSync(secret, "retirewise-salt", 32);
}

function getKey(): Buffer {
  const secret = process.env.ENCRYPTION_KEY || process.env.CRON_SECRET;
  if (!secret) throw new Error("ENCRYPTION_KEY or CRON_SECRET must be set");
  return derive(secret);
}

/**
 * Every key a stored value might have been sealed with, current first.
 *
 * ENCRYPTION_KEY_PREVIOUS exists so a rotation is a window rather than an
 * event: set it to the old value, deploy, re-seal the stored rows with
 * scripts/rotate-keys.ts, then remove it. Without it, changing the secret
 * silently turns every saved API key into unopenable bytes — which surfaces
 * as "the AI stopped working" rather than as an error anyone can act on.
 */
function getKeys(): Buffer[] {
  const keys = [getKey()];
  const previous = process.env.ENCRYPTION_KEY_PREVIOUS;
  if (previous) keys.push(derive(previous));
  return keys;
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

  // Pack: version + iv (hex) + : + encrypted (hex) + : + tag (hex)
  return withVersion(`${iv.toString("hex")}:${encrypted}:${tag.toString("hex")}`);
}

/**
 * Decrypt a previously encrypted string.
 */
export function decrypt(packed: string): string {
  // Values written before versioning carry no prefix and are otherwise
  // identical, so both open the same way.
  const { body } = parseVersion(packed);
  const [ivHex, encrypted, tagHex] = body.split(":");

  if (!ivHex || !encrypted || !tagHex) {
    throw new Error("Invalid encrypted data format");
  }

  const iv = Buffer.from(ivHex, "hex");
  const tag = Buffer.from(tagHex, "hex");

  return tryKeys(getKeys(), (key) => {
    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);
    let decrypted = decipher.update(encrypted, "hex", "utf8");
    decrypted += decipher.final("utf8");
    return decrypted;
  });
}

/** True when a stored value should be re-sealed with the current key. */
export function needsResealing(packed: string): boolean {
  const { version } = parseVersion(packed);
  if (version === null) return true;
  try {
    const current = getKey();
    const { body } = parseVersion(packed);
    const [ivHex, encrypted, tagHex] = body.split(":");
    const decipher = createDecipheriv(ALGORITHM, current, Buffer.from(ivHex, "hex"));
    decipher.setAuthTag(Buffer.from(tagHex, "hex"));
    decipher.update(encrypted, "hex", "utf8");
    decipher.final("utf8");
    return false;
  } catch {
    return true;
  }
}

/**
 * Mask an API key for display: show first 8 and last 4 chars.
 */
export function maskKey(key: string): string {
  if (key.length <= 12) return "****";
  return `${key.slice(0, 8)}...${key.slice(-4)}`;
}
