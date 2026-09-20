/**
 * Re-seal every encrypted value with the current key.
 *
 * Rotation is a three-step move, and the middle step is this script:
 *
 *   1. Set ENCRYPTION_KEY_PREVIOUS (and/or PLAID_TOKEN_ENCRYPTION_KEY_PREVIOUS)
 *      to the CURRENT value, then set the current one to the new key. Deploy.
 *      Both keys now open stored values; new writes use the new key.
 *   2. Run this. Every stored value is decrypted with whichever key works and
 *      written back sealed with the current one.
 *   3. Remove the _PREVIOUS variables. Deploy.
 *
 * Skipping step 2 is the trap: everything keeps working until the day the
 * previous key is removed, and then a column full of bytes nobody can open
 * surfaces as "the AI stopped working" and "that bank account won't refresh".
 *
 * Safe to run more than once, and safe to run when nothing needs doing.
 */
import { eq } from "drizzle-orm";
import { getBaseDb } from "../src/lib/db";
import { plaidItems, userPreferences } from "../src/lib/db/schema";
import { decrypt, encrypt } from "../src/lib/utils/encryption";
import { decryptToken, encryptToken } from "../src/lib/plaid/encryption";

const DRY_RUN = process.argv.includes("--dry-run");

const API_KEY_COLUMNS = ["anthropicApiKey", "googleApiKey", "openaiApiKey"] as const;

async function main() {
  const db = getBaseDb();
  let resealed = 0;
  let unreadable = 0;
  let unchanged = 0;

  const prefs = await db.select().from(userPreferences);
  for (const pref of prefs) {
    const updates: Record<string, string> = {};
    for (const column of API_KEY_COLUMNS) {
      const stored = pref[column];
      if (!stored) continue;
      try {
        const plaintext = decrypt(stored);
        const resealedValue = encrypt(plaintext);
        // Always rewrite: AES-GCM uses a fresh IV each time, so ciphertext
        // equality is not a useful test for "already current".
        updates[column] = resealedValue;
      } catch {
        console.error(
          `  ${pref.clerkId}: ${column} cannot be decrypted with either key — ` +
            `the user will have to re-enter it.`
        );
        unreadable++;
      }
    }
    if (Object.keys(updates).length === 0) {
      unchanged++;
      continue;
    }
    if (!DRY_RUN) {
      await db
        .update(userPreferences)
        .set({ ...updates, updatedAt: new Date() })
        .where(eq(userPreferences.id, pref.id));
    }
    resealed += Object.keys(updates).length;
  }

  const items = await db.select().from(plaidItems);
  for (const item of items) {
    try {
      const token = decryptToken(item.accessTokenEncrypted);
      if (!DRY_RUN) {
        await db
          .update(plaidItems)
          .set({ accessTokenEncrypted: encryptToken(token), updatedAt: new Date() })
          .where(eq(plaidItems.id, item.id));
      }
      resealed++;
    } catch {
      console.error(
        `  ${item.institutionName} (${item.itemId}): access token cannot be ` +
          `decrypted with either key — the household must reconnect it.`
      );
      unreadable++;
    }
  }

  console.log(
    `\n${DRY_RUN ? "[dry run] " : ""}Re-sealed ${resealed} value(s). ` +
      `${unchanged} preference row(s) had nothing to re-seal. ` +
      `${unreadable} value(s) could not be opened.`
  );
  return unreadable;
}

main()
  .then((unreadable) => process.exit(unreadable === 0 ? 0 : 1))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
