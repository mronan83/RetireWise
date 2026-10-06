/**
 * The weekday-evening snapshot, and the daily change it records.
 *
 * Each snapshot records the portfolio's value and the change since the one
 * before, which alerts and reports read, and each position's shares and
 * price, which the period returns read. A second run on
 * the same day used to record a change of nothing and add a second set of
 * rows; and an uncaught error in one household ended the run for every
 * household after it.
 *
 * Runs against a real database: the snapshot is a sequence of writes, and
 * what matters is what is left in the tables.
 */
import { randomUUID } from "crypto";
import { and, eq, sql } from "drizzle-orm";
import { getBaseDb } from "../src/lib/db";
import { withSystemRole } from "../src/lib/db/tenant";
import { accountSnapshots, accounts, holdingSnapshots, holdings, netWorthSnapshots, portfolioSnapshots } from "../src/lib/db/schema";
import { snapshotHousehold, snapshotHouseholds } from "../src/lib/utils/portfolio-snapshot";
import { deleteHouseholdData } from "../src/lib/account/delete";

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${ok || !detail ? "" : ` — ${detail}`}`);
  if (!ok) failures++;
}

const A = `snap_a_${randomUUID()}`;
const B = `snap_b_${randomUUID()}`;
const EMPTY = `snap_empty_${randomUUID()}`;
const FRIDAY = "2026-01-02";
const MONDAY = "2026-01-05";
const system = <T>(fn: () => Promise<T>) => withSystemRole("snapshot job check", fn);

/**
 * A household holding a money-market fund, which the price feed values at
 * $1.00 a share without asking Yahoo, so the check needs no network.
 */
async function seed(clerkId: string, shares: number | null) {
  const base = getBaseDb();
  const [acct] = await base
    .insert(accounts)
    .values({ clerkId, name: "Brokerage", institution: "Test", accountType: "brokerage", taxTreatment: "taxable" })
    .returning({ id: accounts.id });
  if (shares !== null) {
    await base.insert(holdings).values({
      accountId: acct.id,
      ticker: "SPAXX",
      name: "Money market",
      assetClass: "cash",
      shares: String(shares),
      currentPrice: "1",
      currentValue: String(shares),
    });
  }
  return acct.id;
}

async function rowsOn(clerkId: string, date: string) {
  const base = getBaseDb();
  return base
    .select()
    .from(portfolioSnapshots)
    .where(and(eq(portfolioSnapshots.clerkId, clerkId), eq(portfolioSnapshots.snapshotDate, date)));
}

async function count(table: typeof accountSnapshots | typeof holdingSnapshots, clerkId: string, date: string) {
  const [{ n }] = await getBaseDb()
    .select({ n: sql<number>`count(*)::int` })
    .from(table)
    .where(and(eq(table.clerkId, clerkId), eq(table.snapshotDate, date)));
  return n;
}

async function cleanup() {
  for (const id of [A, B, EMPTY]) await system(() => deleteHouseholdData(id));
}

async function main() {
  const base = getBaseDb();
  const accountA = await seed(A, 1000);
  await seed(B, 500);
  await seed(EMPTY, null);
  await base.insert(portfolioSnapshots).values({ clerkId: A, snapshotDate: FRIDAY, totalValue: "900" });

  // ---- the change is measured from the previous day -------------------------
  await system(() => snapshotHousehold(A, MONDAY));
  let monday = await rowsOn(A, MONDAY);
  check("Monday's snapshot records the portfolio at $1,000", monday.length === 1 && Number(monday[0].totalValue) === 1000, JSON.stringify(monday.map((r) => r.totalValue)));
  check(
    "and its daily change is Monday against Friday: +$100, +11.11%",
    Number(monday[0]?.dailyChange) === 100 && Math.abs(Number(monday[0]?.dailyChangePct) - 11.1111) < 0.001,
    `${monday[0]?.dailyChange} (${monday[0]?.dailyChangePct}%)`
  );

  // ---- running again the same day replaces the day, it does not add to it ---
  await system(() => snapshotHousehold(A, MONDAY));
  monday = await rowsOn(A, MONDAY);
  check("a second run on Monday leaves one snapshot for Monday", monday.length === 1, `${monday.length} rows`);
  check("still measured against Friday, not against Monday's first run", Number(monday[0]?.dailyChange) === 100, String(monday[0]?.dailyChange));
  check(
    "with one account snapshot and one position snapshot for the day",
    (await count(accountSnapshots, A, MONDAY)) === 1 && (await count(holdingSnapshots, A, MONDAY)) === 1
  );

  // ---- a later run that day restates the day with what has changed ----------
  await base.update(holdings).set({ shares: "1100" }).where(eq(holdings.accountId, accountA));
  await system(() => snapshotHousehold(A, MONDAY));
  monday = await rowsOn(A, MONDAY);
  const [position] = await base
    .select()
    .from(holdingSnapshots)
    .where(and(eq(holdingSnapshots.clerkId, A), eq(holdingSnapshots.snapshotDate, MONDAY)));
  check(
    "a run after $100 is paid in restates Monday: $1,100, +$200 on Friday",
    monday.length === 1 && Number(monday[0].totalValue) === 1100 && Number(monday[0].dailyChange) === 200,
    `${monday.length} rows, ${monday[0]?.totalValue}, ${monday[0]?.dailyChange}`
  );
  check("and the position snapshot is updated too, not left at the first run's shares", Number(position?.shares) === 1100, String(position?.shares));

  // ---- a household without investments still gets its net worth ------------
  const empty = await system(() => snapshotHousehold(EMPTY, MONDAY));
  const [{ n: netWorthRows }] = await base
    .select({ n: sql<number>`count(*)::int` })
    .from(netWorthSnapshots)
    .where(eq(netWorthSnapshots.clerkId, EMPTY));
  check("a household with no investments records no portfolio snapshot", !empty.snapshotted && (await rowsOn(EMPTY, MONDAY)).length === 0);
  check("but does record its net worth", netWorthRows === 1, `${netWorthRows} rows`);

  // ---- one household's failure stops only that household --------------------
  const result = await system(() =>
    snapshotHouseholds(["broken", A, B], MONDAY, async (clerkId, day) => {
      if (clerkId === "broken") throw new Error("a household that fails");
      return snapshotHousehold(clerkId, day);
    })
  );
  check(
    "a household that fails first does not stop the two after it",
    result.failed === 1 && result.snapshotted === 2 && (await rowsOn(B, MONDAY)).length === 1,
    JSON.stringify(result)
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
