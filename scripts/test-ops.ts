/**
 * Retry policy and key rotation.
 *
 * Both replace behaviour that failed silently. The refresh job used to retire
 * an item permanently on its first failure, and rotating either encryption
 * secret used to orphan every value already stored. Neither raised an error;
 * the first showed a stale number, the second showed "the AI stopped working".
 */
import { backoffMs, needsReconnect, DEAD_LETTER_AFTER } from "../src/lib/plaid/backoff";
import { parseVersion, withVersion } from "../src/lib/crypto/keyring";

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${ok || !detail ? "" : ` — ${detail}`}`);
  if (!ok) failures++;
}

function plaidError(code: string) {
  return { response: { data: { error_code: code } } };
}

async function main() {
  // ---- backoff --------------------------------------------------------
  const waits = [1, 2, 3, 4, 5, 6, 7, 8].map(backoffMs);
  check("the wait grows with each failure", waits.every((w, i) => i === 0 || w >= waits[i - 1]));
  check("the first retry is soon", backoffMs(1) === 15 * 60 * 1000, `${backoffMs(1)}ms`);
  check(
    "the wait is capped, so an outage costs a few calls a day",
    backoffMs(50) === 12 * 60 * 60 * 1000,
    `${backoffMs(50)}ms`
  );
  check("a zero count does not produce a negative wait", backoffMs(0) > 0);

  // ---- terminal vs transient -------------------------------------------
  check(
    "a revoked login needs a person, not a retry",
    needsReconnect(plaidError("ITEM_LOGIN_REQUIRED"))
  );
  check(
    "a revoked permission needs a person",
    needsReconnect(plaidError("USER_PERMISSION_REVOKED"))
  );
  check(
    "a rate limit is transient and keeps being retried",
    !needsReconnect(plaidError("RATE_LIMIT_EXCEEDED"))
  );
  check("a plain network error is transient", !needsReconnect(new Error("socket hang up")));
  check("an undefined error is transient", !needsReconnect(undefined));
  check("giving up takes several attempts", DEAD_LETTER_AFTER >= 5, String(DEAD_LETTER_AFTER));

  // ---- ciphertext versioning -------------------------------------------
  check("a versioned value round-trips", parseVersion(withVersion("abc:def")).body === "abc:def");
  check("the version is read back", parseVersion(withVersion("abc")).version === "v1");
  check(
    "a legacy value has no version and is returned whole",
    (() => {
      const legacy = "0a1b:ffee:9988";
      const p = parseVersion(legacy);
      return p.version === null && p.body === legacy;
    })()
  );
  check(
    "a hex field is not mistaken for a version",
    parseVersion("v:1:2").version === null
  );

  // ---- encryption, with and without a previous key ----------------------
  process.env.ENCRYPTION_KEY = "key-one-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
  delete process.env.ENCRYPTION_KEY_PREVIOUS;
  const { encrypt, decrypt } = await import("../src/lib/utils/encryption");

  const secret = "sk-ant-not-a-real-key";
  const sealedWithOne = encrypt(secret);
  check("a value round-trips", decrypt(sealedWithOne) === secret);
  check("new ciphertext carries a version", sealedWithOne.startsWith("v1:"));

  // Rotate: the old key becomes PREVIOUS, a new key becomes current.
  process.env.ENCRYPTION_KEY_PREVIOUS = "key-one-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
  process.env.ENCRYPTION_KEY = "key-two-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
  check(
    "a value sealed before the rotation still opens during it",
    decrypt(sealedWithOne) === secret
  );
  const sealedWithTwo = encrypt(secret);
  check("a value sealed after the rotation opens", decrypt(sealedWithTwo) === secret);

  // Finish the rotation: drop the previous key.
  delete process.env.ENCRYPTION_KEY_PREVIOUS;
  check("the re-sealed value survives dropping the old key", decrypt(sealedWithTwo) === secret);

  let orphaned = false;
  try {
    decrypt(sealedWithOne);
  } catch {
    orphaned = true;
  }
  check(
    "a value never re-sealed is orphaned once the old key goes — which is what scripts/rotate-keys.ts prevents",
    orphaned
  );

  console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILED`);
  return failures;
}

main()
  .then((f) => process.exit(f === 0 ? 0 : 1))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
