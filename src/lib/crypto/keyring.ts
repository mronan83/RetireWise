/**
 * Key material, with a way out.
 *
 * Both encrypted columns — user API keys and Plaid access tokens — were sealed
 * with a single key and a ciphertext format that recorded nothing about which
 * key that was. Rotating either secret therefore orphaned every value already
 * stored: not an error, just a column full of bytes nobody could open.
 *
 * Two changes fix that. New ciphertext carries a version prefix, so the format
 * can move without guessing. And decryption tries the previous key after the
 * current one, so a rotation has a window during which both work and the
 * stored values can be re-sealed in the background rather than all at once.
 */

export const CURRENT_VERSION = "v1";

/** Split a stored value into its version and the rest. Legacy values have none. */
export function parseVersion(packed: string): { version: string | null; body: string } {
  const i = packed.indexOf(":");
  if (i === -1) return { version: null, body: packed };
  const head = packed.slice(0, i);
  if (/^v\d+$/.test(head)) return { version: head, body: packed.slice(i + 1) };
  return { version: null, body: packed };
}

export function withVersion(body: string): string {
  return `${CURRENT_VERSION}:${body}`;
}

/**
 * Try each key in turn.
 *
 * Current first, so the common case costs one attempt. The last failure is
 * rethrown rather than a generic one, so a genuinely corrupt value and a
 * missing key do not look the same in the logs.
 */
export function tryKeys<T>(keys: Buffer[], open: (key: Buffer) => T): T {
  let lastError: unknown;
  for (const key of keys) {
    try {
      return open(key);
    } catch (e) {
      lastError = e;
    }
  }
  throw lastError ?? new Error("No decryption key available.");
}
