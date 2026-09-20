import "server-only";
import { createHash, createPublicKey, verify as verifySignature } from "crypto";
import { getPlaidClient } from "./client";

/**
 * Verify that a webhook body really came from Plaid.
 *
 * Plaid signs each delivery with a JWT in the `plaid-verification` header.
 * The JWT is ES256, its `kid` names a key fetched from Plaid's API, and its
 * `request_body_sha256` claim covers the exact bytes of the body — so the
 * signature is only worth anything if the hash is checked against the raw
 * payload rather than a re-serialised copy of it.
 *
 * Until this existed, the handler accepted any POST from anyone. Its blast
 * radius was small because it only bumped a timestamp, but "small today" is
 * not a property that survives the next change to the file.
 */

type JwtHeader = { alg?: string; kid?: string };
type JwtPayload = { iat?: number; request_body_sha256?: string };

/** Cached verification keys, by kid. Plaid's keys are stable between rotations. */
const keyCache = new Map<string, string>();

/** A delivery older than this is refused, so a captured one cannot be replayed. */
const MAX_AGE_SECONDS = 5 * 60;

function base64UrlDecode(part: string): Buffer {
  return Buffer.from(part.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

function derFromJoseSignature(sig: Buffer): Buffer {
  // JOSE gives r and s as two fixed-width integers; Node's verifier wants DER.
  const half = sig.length / 2;
  const trim = (b: Buffer) => {
    let i = 0;
    while (i < b.length - 1 && b[i] === 0) i++;
    const out = b.subarray(i);
    // DER integers are signed, so a leading high bit needs a zero byte.
    return out[0] & 0x80 ? Buffer.concat([Buffer.from([0]), out]) : out;
  };
  const r = trim(sig.subarray(0, half));
  const s = trim(sig.subarray(half));
  const body = Buffer.concat([
    Buffer.from([0x02, r.length]),
    r,
    Buffer.from([0x02, s.length]),
    s,
  ]);
  return Buffer.concat([Buffer.from([0x30, body.length]), body]);
}

async function getVerificationKey(kid: string): Promise<string | null> {
  const cached = keyCache.get(kid);
  if (cached) return cached;

  try {
    const client = getPlaidClient();
    const res = await client.webhookVerificationKeyGet({ key_id: kid });
    const jwk = res.data.key;
    // Plaid returns a JWK; Node can import it directly as a public key.
    const pem = createPublicKey({
      key: { kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y } as never,
      format: "jwk",
    }).export({ type: "spki", format: "pem" }) as string;
    keyCache.set(kid, pem);
    return pem;
  } catch (e) {
    console.warn(`Could not fetch Plaid webhook key ${kid}:`, e);
    return null;
  }
}

export type VerifyOutcome =
  | { ok: true }
  | { ok: false; reason: string };

export async function verifyPlaidWebhook(
  rawBody: string,
  header: string | null
): Promise<VerifyOutcome> {
  if (!header) return { ok: false, reason: "missing plaid-verification header" };

  const parts = header.split(".");
  if (parts.length !== 3) return { ok: false, reason: "malformed JWT" };

  let head: JwtHeader;
  let payload: JwtPayload;
  try {
    head = JSON.parse(base64UrlDecode(parts[0]).toString("utf8"));
    payload = JSON.parse(base64UrlDecode(parts[1]).toString("utf8"));
  } catch {
    return { ok: false, reason: "unreadable JWT" };
  }

  // Pinned, not read from the token: accepting whatever `alg` the token names
  // is how "alg: none" and HMAC-with-the-public-key forgeries get through.
  if (head.alg !== "ES256") return { ok: false, reason: `unexpected alg ${head.alg}` };
  if (!head.kid) return { ok: false, reason: "no kid" };

  const pem = await getVerificationKey(head.kid);
  if (!pem) return { ok: false, reason: "unknown key" };

  const signed = Buffer.from(`${parts[0]}.${parts[1]}`, "utf8");
  let der: Buffer;
  try {
    der = derFromJoseSignature(base64UrlDecode(parts[2]));
  } catch {
    return { ok: false, reason: "malformed signature" };
  }

  if (!verifySignature("sha256", signed, pem, der)) {
    return { ok: false, reason: "bad signature" };
  }

  if (typeof payload.iat !== "number") return { ok: false, reason: "no iat" };
  if (Math.floor(Date.now() / 1000) - payload.iat > MAX_AGE_SECONDS) {
    return { ok: false, reason: "stale delivery" };
  }

  const expected = createHash("sha256").update(rawBody, "utf8").digest("hex");
  if (payload.request_body_sha256 !== expected) {
    // A valid signature over a different body. Without this check the JWT
    // proves only that Plaid once signed something, not that they sent this.
    return { ok: false, reason: "body does not match signature" };
  }

  return { ok: true };
}
