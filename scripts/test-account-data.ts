/**
 * Export completeness and deletion completeness.
 *
 * Both are the same property from opposite ends: the set of tables keyed to a
 * household must be the set the export covers and the set deletion clears. A
 * table added later and wired into neither is the failure this guards against
 * — an export that silently omits it still looks like a full one, and a
 * deletion that silently keeps it still reports success.
 */
import { randomUUID } from "crypto";
import { eq, sql } from "drizzle-orm";
import { getBaseDb } from "../src/lib/db";
import { withTenant } from "../src/lib/db/tenant";
import {
  accounts,
  contributions,
  debts,
  goalLinks,
  goals,
  holdingSnapshots,
  holdings,
  householdJoinAttempts,
  householdMembers,
  households,
  plaidItems,
  userPreferences,
} from "../src/lib/db/schema";
import { buildAccountExport } from "../src/lib/account/export";
import { deleteHouseholdData } from "../src/lib/account/delete";
import { encryptToken } from "../src/lib/plaid/encryption";
import { encrypt } from "../src/lib/utils/encryption";

// The encryption keys are not part of what is under test here, only that
// what they produce never reaches an export. A fixed pair keeps the run
// self-contained rather than depending on a deployment's secrets.
process.env.PLAID_TOKEN_ENCRYPTION_KEY ??= "0".repeat(64);
process.env.ENCRYPTION_KEY ??= "test-key-for-account-data-suite";

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${ok || !detail ? "" : ` — ${detail}`}`);
  if (!ok) failures++;
}

const A = `exp_a_${randomUUID()}`;
const B = `exp_b_${randomUUID()}`;
const PLAID_TOKEN = "access-sandbox-do-not-use";
const AI_KEY = "sk-ant-secret-value-do-not-leak";

async function seed(clerkId: string, marker: string) {
  const base = getBaseDb();
  const [h] = await base
    .insert(households)
    .values({ primaryClerkId: clerkId, name: `${marker} Household` })
    .returning({ id: households.id });
  await base.insert(householdMembers).values({ householdId: h.id, clerkId, role: "primary" });

  const [acct] = await base
    .insert(accounts)
    .values({
      clerkId,
      name: `${marker} Brokerage`,
      institution: "Test",
      accountType: "brokerage",
      taxTreatment: "taxable",
    })
    .returning({ id: accounts.id });

  await base.insert(holdings).values({
    accountId: acct.id,
    ticker: marker,
    name: `${marker} Fund`,
    assetClass: "us_stock",
    shares: "10",
    costBasisPerShare: "10",
    currentPrice: "12",
    currentValue: "120",
  });
  await base.insert(userPreferences).values({
    clerkId,
    currentAge: 45,
    anthropicApiKey: encrypt(AI_KEY),
  });
  await base.insert(debts).values({
    clerkId,
    name: `${marker} Mortgage`,
    debtType: "mortgage",
    currentBalance: "100000",
    interestRate: "5.5",
    monthlyPayment: "1500",
  });
  await base.insert(contributions).values({
    clerkId,
    accountId: acct.id,
    owner: "self",
    label: `${marker} 401k`,
    accountType: "401k",
    contributionMethod: "fixed_amount",
    contributionAmount: "500",
  });
  await base.insert(plaidItems).values({
    clerkId,
    itemId: `item_${randomUUID()}`,
    accessTokenEncrypted: encryptToken(PLAID_TOKEN),
    institutionName: `${marker} Bank`,
  });
  // The two tables erasure and the export once missed, and one more the
  // export did: each needs a row here or nothing proves it is handled.
  await base.insert(holdingSnapshots).values({
    clerkId,
    accountId: acct.id,
    snapshotDate: "2026-09-30",
    ticker: marker,
    shares: "10",
    price: "12",
    value: "120",
  });
  const [goal] = await base
    .insert(goals)
    .values({ clerkId, name: `${marker} Goal`, targetAmount: "1000" })
    .returning({ id: goals.id });
  await base.insert(goalLinks).values({
    clerkId,
    goalId: goal.id,
    itemType: "account",
    itemId: acct.id,
    baselineAmount: "100",
  });
  await base.insert(householdJoinAttempts).values({ clerkId, succeeded: false });
  return { householdId: h.id, accountId: acct.id };
}

/**
 * Every table the database says is keyed to a household, an account or a
 * member — read from the schema itself, so a table added later is covered
 * without anyone remembering to add it here.
 */
async function keyedTables(): Promise<{ table: string; column: string }[]> {
  const rows = await getBaseDb().execute(sql`
    SELECT table_name AS table, column_name AS column
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND column_name IN ('clerk_id', 'account_id', 'household_id', 'primary_clerk_id')
    ORDER BY table_name, column_name`);
  return rows as unknown as { table: string; column: string }[];
}

/** Rows still in the database for one household, per table, read directly rather than through the export. */
async function rowsLeft(keys: { clerkId: string; householdId: string; accountId: string }) {
  const base = getBaseDb();
  const left: string[] = [];
  for (const { table, column } of await keyedTables()) {
    const value = column === "account_id" ? keys.accountId : column === "household_id" ? keys.householdId : keys.clerkId;
    const [{ n }] = (await base.execute(
      sql`SELECT count(*)::int AS n FROM ${sql.identifier(table)} WHERE ${sql.identifier(column)}::text = ${value}`
    )) as unknown as { n: number }[];
    if (n > 0) left.push(`${table}.${column}=${n}`);
  }
  return left;
}

/** Where each keyed table appears in the export. Tables not listed here are expected under data.<camelCase name>. */
const EXPORTED_ELSEWHERE: Record<string, string> = {
  households: "household",
  household_members: "household.members",
  user_preferences: "data.preferences",
  subscriptions: "data.subscription",
};
const camel = (t: string) => t.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());

async function cleanup() {
  const base = getBaseDb();
  for (const id of [A, B]) {
    try {
      await withTenant(id, id, () => deleteHouseholdData(id));
    } catch {
      /* best effort */
    }
  }
  await base.delete(households).where(sql`${households.primaryClerkId} IN (${A}, ${B})`);
}

async function main() {
  const seededA = await seed(A, "AAAA");
  await seed(B, "BBBB");

  // ---- export -----------------------------------------------------------
  const exported = await withTenant(A, A, () => buildAccountExport(A));
  const asText = JSON.stringify(exported);

  check(
    "the export includes the household's accounts",
    exported.data.accounts.length === 1,
    `${exported.data.accounts.length}`
  );
  check("holdings are included", exported.data.holdings.length === 1);
  check("debts are included", exported.data.debts.length === 1);
  check("contributions are included", exported.data.contributions.length === 1);
  check("linked institutions are included", exported.data.plaidItems.length === 1);
  check("holding snapshots are included", exported.data.holdingSnapshots?.length === 1, String(exported.data.holdingSnapshots?.length));
  check("goal links are included", exported.data.goalLinks?.length === 1, String(exported.data.goalLinks?.length));
  check("the household's join attempts are included", exported.data.householdJoinAttempts?.length === 1, String(exported.data.householdJoinAttempts?.length));

  const tables = [...new Set((await keyedTables()).map((k) => k.table))];
  const notExported = tables.filter((t) => {
    const where = EXPORTED_ELSEWHERE[t];
    if (where === "household") return !exported.household;
    if (where === "household.members") return !(exported.household as { members?: unknown[] })?.members;
    if (where) return !(where.slice(5) in exported.data);
    return !(camel(t) in exported.data);
  });
  check(
    `every one of the ${tables.length} household-keyed tables has a place in the export`,
    notExported.length === 0,
    `missing: ${notExported.join(", ")}`
  );

  check(
    "no other household's data leaks into the export",
    !asText.includes("BBBB") && !asText.includes(B),
    "found the other household's marker"
  );

  // The point of encrypting those columns is defeated if an export undoes it.
  check("the Plaid access token is not in the export", !asText.includes(PLAID_TOKEN));
  check("the AI provider key is not in the export", !asText.includes(AI_KEY));
  check(
    "the encrypted columns are stripped, not just unreadable",
    !asText.includes("accessTokenEncrypted") && !asText.includes("anthropicApiKey")
  );
  check(
    "but the export says a key exists",
    exported.credentials.aiProviderKeysStored.includes("anthropic"),
    JSON.stringify(exported.credentials.aiProviderKeysStored)
  );
  check(
    "and names the linked institution",
    exported.credentials.linkedInstitutions.some((i) => i.institution === "AAAA Bank")
  );
  check("the invite code hash is never exported", !asText.includes("codeHash"));

  // ---- deletion ---------------------------------------------------------
  const result = await withTenant(A, A, () => deleteHouseholdData(A));
  check("deletion removes rows", result.totalRows > 0, `${result.totalRows}`);

  const after = await withTenant(A, A, () => buildAccountExport(A));
  const remaining = Object.entries(after.data)
    .map(([table, rows]) => [table, Array.isArray(rows) ? rows.length : 0] as const)
    .filter(([, n]) => n > 0);
  check(
    "nothing is left behind",
    remaining.length === 0,
    remaining.map(([t, n]) => `${t}=${n}`).join(", ")
  );

  // The check above reads through the export, so a table missing from both
  // would pass it. This one asks the database.
  const left = await rowsLeft({ clerkId: A, ...seededA });
  check("no row keyed to the household remains in any table", left.length === 0, left.join(", "));

  const base = getBaseDb();
  const [{ leftover }] = await base
    .select({ leftover: sql<number>`count(*)::int` })
    .from(households)
    .where(eq(households.primaryClerkId, A));
  check("the household row itself is gone", leftover === 0, `${leftover}`);

  // ---- and the other household is untouched ------------------------------
  const other = await withTenant(B, B, () => buildAccountExport(B));
  check(
    "deleting one household does not touch another",
    other.data.accounts.length === 1 && other.data.holdings.length === 1,
    `accounts=${other.data.accounts.length} holdings=${other.data.holdings.length}`
  );

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
