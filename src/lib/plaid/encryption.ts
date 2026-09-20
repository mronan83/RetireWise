import { createCipheriv, createDecipheriv, randomBytes } from "crypto";
import { parseVersion, tryKeys, withVersion } from "@/lib/crypto/keyring";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;
const TAG_LENGTH = 16;

function getKey(): Buffer {
  const key = process.env.PLAID_TOKEN_ENCRYPTION_KEY;
  if (!key) throw new Error("PLAID_TOKEN_ENCRYPTION_KEY not set");
  // Key must be 32 bytes for AES-256
  return Buffer.from(key, "hex");
}

/**
 * Current key first, then the previous one if a rotation is in progress.
 *
 * A Plaid access token that cannot be decrypted is worse than a lost API key:
 * the institution stays linked, the refresh job keeps failing, and the only
 * way back is for the user to reconnect the account by hand.
 */
function getKeys(): Buffer[] {
  const keys = [getKey()];
  const previous = process.env.PLAID_TOKEN_ENCRYPTION_KEY_PREVIOUS;
  if (previous) keys.push(Buffer.from(previous, "hex"));
  return keys;
}

export function encryptToken(plaintext: string): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, getKey(), iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  // Format: version:iv:tag:encrypted (all hex)
  return withVersion(
    `${iv.toString("hex")}:${tag.toString("hex")}:${encrypted.toString("hex")}`
  );
}

export function decryptToken(ciphertext: string): string {
  // Tokens written before versioning carry no prefix; the rest is identical.
  const { body } = parseVersion(ciphertext);
  const [ivHex, tagHex, encryptedHex] = body.split(":");
  const iv = Buffer.from(ivHex, "hex");
  const tag = Buffer.from(tagHex, "hex");
  const encrypted = Buffer.from(encryptedHex, "hex");

  return tryKeys(getKeys(), (key) => {
    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
  });
}
