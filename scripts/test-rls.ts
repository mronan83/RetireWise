/**
 * Proof that one household cannot reach another's rows.
 *
 * Every assertion here is written the way the bug would be written: a query
 * with no `where clerk_id`, or with the wrong one. Under the old arrangement
 * all of them returned the other household's data, because the application
 * connects as the table owner and row level security was skipped twice over.
 *
 * If this file ever passes trivially — because the policies were dropped, the
 * role regained BYPASSRLS, or withTenant stopped setting the role — the
 * "sees nothing" assertions turn into "sees everything" and fail loudly.
 */
import { randomUUID } from "crypto";
import { eq, sql } from "drizzle-orm";
import { getBaseDb } from "../src/lib/db";
import { getDb, withSystemRole, withTenant } from "../src/lib/db/tenant";
import { accounts, holdings, userPreferences } from "../src/lib/db/schema";

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${ok || !detail ? "" : ` — ${detail}`}`);
  if (!ok) failures++;
}

const A = `rls_a_${randomUUID()}`;
const B = `rls_b_${randomUUID()}`;
let accountA = "";
let accountB = "";

async function seed() {
  const base = getBaseDb();
  for (const [clerkId, name] of [[A, "A Brokerage"], [B, "B Brokerage"]] as const) {
    const [acct] = await base
      .insert(accounts)
      .values({
        clerkId,
        name,
        institution: "Test",
        accountType: "brokerage",
        taxTreatment: "taxable",
      })
      .returning({ id: accounts.id });
    if (clerkId === A) accountA = acct.id;
    else accountB = acct.id;

    await base.insert(holdings).values({
      accountId: acct.id,
      ticker: clerkId === A ? "AAAA" : "BBBB",
      name: `${clerkId === A ? "A" : "B"} Fund`,
      assetClass: "us_stock",
      shares: "10",
      costBasisPerShare: "10",
      currentPrice: "10",
      currentValue: "100",
    });
    await base.insert(userPreferences).values({ clerkId, currentAge: 40 });
  }
}

async function cleanup() {
  const base = getBaseDb();
  await base.delete(holdings).where(sql`${holdings.accountId} IN (${accountA}, ${accountB})`);
  await base.delete(accounts).where(sql`${accounts.clerkId} IN (${A}, ${B})`);
  await base.delete(userPreferences).where(sql`${userPreferences.clerkId} IN (${A}, ${B})`);
}

async function main() {
  await seed();

  // ---- the query that forgets its filter --------------------------------
  await withTenant(A, A, async () => {
    const all = await getDb().select().from(accounts);
    check(
      "an unfiltered SELECT returns only this household's accounts",
      all.length === 1 && all[0].clerkId === A,
      `${all.length} rows: ${all.map((r) => r.name).join(", ")}`
    );

    const prefs = await getDb().select().from(userPreferences);
    check(
      "an unfiltered SELECT on preferences is scoped too",
      prefs.length === 1 && prefs[0].clerkId === A,
      `${prefs.length} rows`
    );
  });

  // ---- the query with somebody else's id --------------------------------
  await withTenant(A, A, async () => {
    const theirs = await getDb().select().from(accounts).where(eq(accounts.clerkId, B));
    check("asking for another household's rows by id returns nothing", theirs.length === 0);
  });

  // ---- rows reached through their parent ---------------------------------
  await withTenant(A, A, async () => {
    const all = await getDb().select().from(holdings);
    check(
      "holdings are scoped through their account",
      all.length === 1 && all[0].ticker === "AAAA",
      `${all.length} rows: ${all.map((h) => h.ticker).join(", ")}`
    );
  });

  // ---- writes are constrained, not just reads ----------------------------
  // The try sits outside withTenant on purpose. A policy violation aborts the
  // whole transaction, and since an entry point runs in one transaction, the
  // request fails rather than half-completing. That is the right behaviour and
  // worth asserting in the shape production will see it.
  let rejected = false;
  try {
    await withTenant(A, A, async () => {
      await getDb().insert(userPreferences).values({ clerkId: B, currentAge: 99 });
    });
  } catch {
    rejected = true;
  }
  check("inserting a row keyed to another household is refused", rejected);

  await withTenant(A, A, async () => {
    const updated = await getDb()
      .update(accounts)
      .set({ name: "hijacked" })
      .where(eq(accounts.clerkId, B))
      .returning({ id: accounts.id });
    check("updating another household's row changes nothing", updated.length === 0);
  });

  await withTenant(A, A, async () => {
    const deleted = await getDb()
      .delete(accounts)
      .where(eq(accounts.clerkId, B))
      .returning({ id: accounts.id });
    check("deleting another household's row removes nothing", deleted.length === 0);
  });

  // ---- and B still has everything ----------------------------------------
  await withTenant(B, B, async () => {
    const all = await getDb().select().from(accounts);
    check(
      "the other household is untouched and can still see its own row",
      all.length === 1 && all[0].name === "B Brokerage",
      all.map((r) => r.name).join(", ")
    );
  });

  // ---- the role really is dropped ----------------------------------------
  await withTenant(A, A, async () => {
    const [{ role, bypasses }] = await getDb().execute<{ role: string; bypasses: boolean }>(
      sql`SELECT current_user AS role,
                 (SELECT rolbypassrls FROM pg_roles WHERE rolname = current_user) AS bypasses`
    );
    check("statements run as app_user", role === "app_user", role);
    check("that role cannot bypass row level security", bypasses === false, String(bypasses));
  });

  // ---- and it does not leak past the transaction --------------------------
  const [{ after }] = await getBaseDb().execute<{ after: string }>(
    sql`SELECT current_user AS after`
  );
  check("the role does not leak out of withTenant", after !== "app_user", after);

  // ---- system role is still privileged, deliberately ----------------------
  await withSystemRole("verify the escape hatch still works", async () => {
    const all = await getDb().select().from(accounts).where(sql`${accounts.clerkId} IN (${A}, ${B})`);
    check("withSystemRole still sees every household", all.length === 2, `${all.length} rows`);
  });

  await cleanup();
  console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILED`);
  return failures;
}

main()
  .then((f) => process.exit(f === 0 ? 0 : 1))
  .catch(async (e) => {
    console.error(e);
    try { await cleanup(); } catch { /* best effort */ }
    process.exit(1);
  });
