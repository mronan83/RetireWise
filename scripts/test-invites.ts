/**
 * Invite redemption behaviour, against a real database.
 *
 * The properties here are the ones that made the old invite code a way into
 * someone else's finances: guessability, unlimited reuse, no expiry, no rate
 * limit, and a redemption path that two callers could win at once. Each is
 * asserted rather than assumed, because every one of them was true and nothing
 * in the app noticed.
 */
import { randomUUID } from "crypto";
import { and, eq, sql } from "drizzle-orm";
import { getDb } from "../src/lib/db";
import {
  householdInvites,
  householdJoinAttempts,
  householdMembers,
  households,
} from "../src/lib/db/schema";
import {
  createInvite,
  generateInviteCode,
  normalizeInviteCode,
  redeemInvite,
  revokeInvite,
} from "../src/lib/invites";

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${ok || !detail ? "" : ` — ${detail}`}`);
  if (!ok) failures++;
}

const db = getDb();
const owner = `test_owner_${randomUUID()}`;
const joiner = () => `test_joiner_${randomUUID()}`;
let householdId = "";

async function setup() {
  const [h] = await db
    .insert(households)
    .values({ primaryClerkId: owner, name: "Test Household" })
    .returning({ id: households.id });
  householdId = h.id;
  await db.insert(householdMembers).values({ householdId, clerkId: owner, role: "primary" });
}

async function cleanup() {
  // household_invites cascades from households; members and attempts do not.
  await db.delete(householdMembers).where(eq(householdMembers.householdId, householdId));
  await db.delete(households).where(eq(households.id, householdId));
  await db
    .delete(householdJoinAttempts)
    .where(sql`${householdJoinAttempts.clerkId} LIKE 'test_joiner_%'`);
}

async function main() {
  await setup();

  // ---- the code itself -----------------------------------------------------
  const codes = Array.from({ length: 2000 }, generateInviteCode);
  check("codes are 4 groups of 4", codes.every((c) => /^[0-9A-HJKMNP-TV-Z]{4}(-[0-9A-HJKMNP-TV-Z]{4}){3}$/.test(c)));
  check(
    "codes avoid the characters people misread (I, L, O, U)",
    codes.every((c) => !/[ILOU]/.test(c))
  );
  check("2000 codes are all distinct", new Set(codes).size === 2000);
  check(
    "normalisation folds the characters people type by habit",
    normalizeInviteCode("abcd-efgh-jkmn-pqrs") === "ABCDEFGHJKMNPQRS" &&
      normalizeInviteCode(" il0o 1234-5678 9abc ") === "1100123456789ABC",
    normalizeInviteCode(" il0o 1234-5678 9abc ")
  );

  // ---- the plaintext is not recoverable ------------------------------------
  const { code, invite } = await createInvite(householdId, owner, "spouse");
  const [stored] = await db
    .select()
    .from(householdInvites)
    .where(eq(householdInvites.id, invite.id));
  check(
    "only a hash is stored, never the code",
    stored.codeHash !== normalizeInviteCode(code) && stored.codeHash.length === 64
  );
  check("the hint is the last four characters", stored.codeHint === normalizeInviteCode(code).slice(-4));

  // ---- a wrong code is refused and counted ---------------------------------
  const guesser = joiner();
  const wrong = await redeemInvite(generateInviteCode(), guesser);
  check("a wrong code is refused", !wrong.ok && wrong.reason === "invalid");
  const [{ attempts }] = await db
    .select({ attempts: sql<number>`count(*)::int` })
    .from(householdJoinAttempts)
    .where(and(eq(householdJoinAttempts.clerkId, guesser), eq(householdJoinAttempts.succeeded, false)));
  check("a failed attempt is recorded", attempts === 1);

  // ---- rate limiting does not need Redis -----------------------------------
  for (let i = 0; i < 10; i++) await redeemInvite(generateInviteCode(), guesser);
  const limited = await redeemInvite(code, guesser);
  check(
    "a guesser is rate limited before a valid code would work",
    !limited.ok && limited.reason === "rate_limited",
    JSON.stringify(limited)
  );

  // ---- single use ----------------------------------------------------------
  const first = joiner();
  const ok = await redeemInvite(code, first);
  check("a valid code joins the household", ok.ok && ok.householdId === householdId, JSON.stringify(ok));

  const second = await redeemInvite(code, joiner());
  check("the same code cannot be redeemed twice", !second.ok && second.reason === "used", JSON.stringify(second));

  // ---- expiry --------------------------------------------------------------
  const expired = await createInvite(householdId, owner);
  await db
    .update(householdInvites)
    .set({ expiresAt: new Date(Date.now() - 1000) })
    .where(eq(householdInvites.id, expired.invite.id));
  const expiredResult = await redeemInvite(expired.code, joiner());
  check("an expired code is refused", !expiredResult.ok && expiredResult.reason === "expired");

  // ---- revocation ----------------------------------------------------------
  const revocable = await createInvite(householdId, owner);
  check("an invite can be revoked", await revokeInvite(revocable.invite.id, householdId));
  const revokedResult = await redeemInvite(revocable.code, joiner());
  check("a revoked code is refused", !revokedResult.ok && revokedResult.reason === "revoked");
  check(
    "revocation is scoped to the household",
    !(await revokeInvite((await createInvite(householdId, owner)).invite.id, randomUUID()))
  );

  // ---- the race ------------------------------------------------------------
  // Two people redeeming the same code at the same instant both pass every
  // read-only check. Only the conditional UPDATE decides it.
  const contested = await createInvite(householdId, owner);
  const racers = [joiner(), joiner(), joiner(), joiner()];
  const results = await Promise.all(racers.map((r) => redeemInvite(contested.code, r)));
  const winners = results.filter((r) => r.ok);
  check(
    "exactly one of four simultaneous redemptions wins",
    winners.length === 1,
    `${winners.length} winners: ${JSON.stringify(results)}`
  );
  const [{ members }] = await db
    .select({ members: sql<number>`count(*)::int` })
    .from(householdMembers)
    .where(eq(householdMembers.householdId, householdId));
  check("the race added exactly one member", members === 3, `members=${members}`);

  await cleanup();
  console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILED`);
  return failures;
}

main()
  // process.exit rather than closing the pool: the driver keeps an idle
  // connection open and the script would otherwise hang CI forever, which is
  // exactly how the demo seeder used to fail.
  .then((f) => process.exit(f === 0 ? 0 : 1))
  .catch(async (e) => {
    console.error(e);
    try { await cleanup(); } catch { /* best effort */ }
    process.exit(1);
  });
