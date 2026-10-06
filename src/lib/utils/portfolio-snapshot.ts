import { and, eq, sql } from "drizzle-orm";
import { getDb } from "../db";
import { accounts, holdings, portfolioSnapshots, accountSnapshots, holdingSnapshots, goals as goalsTable } from "../db/schema";
import { calculateAllocation } from "./calculations";
import { gainLossFor, rollupBasis } from "./cost-basis";
import { getSnapshotBefore } from "../queries/snapshots";
import { updateAllPrices } from "./price-feed";
import { generateAlerts } from "./alert-generator";
import { snapshotNetWorth } from "./net-worth-snapshot";
import { findGoalsToClose } from "../queries/goals";

/**
 * The weekday-evening snapshot of one household: fresh prices, then the
 * portfolio, account and position records the dashboard, the account cards
 * and the daily change are read from, then net worth, alerts and goals.
 *
 * `today` is the calendar day the snapshot is recorded under. The daily
 * change is today's total less the total of the latest snapshot from an
 * earlier day, so it is the change since the last weekday evening, money
 * paid in or out included. Running it twice on one day replaces that day's
 * records instead of adding a second set.
 */
export async function snapshotHousehold(
  clerkId: string,
  today: string
): Promise<{ snapshotted: boolean; pricesUpdated: number }> {
  const db = getDb();
  let pricesUpdated = 0;

  // Step 1: Update all holding prices from Yahoo Finance
  try {
    const priceResult = await updateAllPrices(clerkId);
    pricesUpdated += priceResult.updated;
    console.log(
      `Updated ${priceResult.updated} prices for user ${clerkId} (${priceResult.failed} failed)`
    );
  } catch (e) {
    console.error(`Price update failed for ${clerkId}:`, e);
  }

  // Step 2: Take portfolio snapshot with fresh prices
  const userHoldings = await db
    .select()
    .from(holdings)
    .innerJoin(accounts, eq(holdings.accountId, accounts.id))
    .where(eq(accounts.clerkId, clerkId));

  const holdingsData = userHoldings.map((h) => h.holdings);

  const totalValue = holdingsData.reduce(
    (sum, h) => sum + Number(h.currentValue),
    0
  );

  // A household with no investments still has a net worth to record.
  if (totalValue === 0) {
    await snapshotNetWorth(clerkId, 0);
    return { snapshotted: false, pricesUpdated };
  }

  // Per-owner values
  let selfValue = 0;
  let spouseValue = 0;
  for (const row of userHoldings) {
    const val = Number(row.holdings.currentValue);
    if (row.accounts.owner === "spouse") {
      spouseValue += val;
    } else {
      selfValue += val;
    }
  }

  const allocation = calculateAllocation(holdingsData);

  // The day's change is measured from the last snapshot before today, so
  // a second run on the same day restates the change instead of measuring
  // it against the first run and recording nothing.
  const prevSnapshot = await getSnapshotBefore(clerkId, today);
  const prevValue = prevSnapshot
    ? Number(prevSnapshot.totalValue)
    : totalValue;
  const dailyChange = totalValue - prevValue;
  const dailyChangePct =
    prevValue > 0 ? (dailyChange / prevValue) * 100 : 0;

  // Top holdings
  const sorted = [...holdingsData].sort(
    (a, b) => Number(b.currentValue) - Number(a.currentValue)
  );
  const topHoldings = sorted.slice(0, 10).map((h) => ({
    ticker: h.ticker,
    value: Number(h.currentValue),
    pct: totalValue > 0 ? (Number(h.currentValue) / totalValue) * 100 : 0,
  }));

  // One snapshot per household per day: a second run replaces the first.
  await db
    .delete(portfolioSnapshots)
    .where(and(eq(portfolioSnapshots.clerkId, clerkId), eq(portfolioSnapshots.snapshotDate, today)));
  await db
    .delete(accountSnapshots)
    .where(and(eq(accountSnapshots.clerkId, clerkId), eq(accountSnapshots.snapshotDate, today)));

  await db.insert(portfolioSnapshots).values({
    clerkId,
    snapshotDate: today,
    totalValue: String(totalValue),
    selfValue: String(selfValue),
    spouseValue: String(spouseValue),
    allocation,
    topHoldings,
    dailyChange: String(dailyChange),
    dailyChangePct: String(dailyChangePct),
  });

  // Per-account snapshots (for time-period performance on account cards)
  const byAccount = new Map<string, { value: number; holdings: typeof userHoldings[number]["holdings"][] }>();
  for (const row of userHoldings) {
    const acctId = row.accounts.id;
    const entry = byAccount.get(acctId) || { value: 0, holdings: [] };
    entry.value += Number(row.holdings.currentValue);
    entry.holdings.push(row.holdings);
    byAccount.set(acctId, entry);
  }

  for (const [acctId, data] of byAccount) {
    /**
     * A snapshot with no basis records no basis.
     *
     * `Number(costBasisPerShare) * shares` turned an unreported basis into
     * zero and wrote it down as history — so the recorded gain for an
     * employer plan was the account's whole value, or, once the sync had
     * fabricated a basis equal to market value, exactly nothing. Either
     * way a year of snapshots would carry a number nobody measured.
     */
    /**
     * Positions, not just the total.
     *
     * Share counts are what make tomorrow's performance figure a return
     * rather than a balance change: shares that rise without the market
     * rising are money paid in, and a return excludes it. Recorded here
     * because the sync already has them and nothing else keeps them.
     */
    if (data.holdings.length > 0) {
      await db
        .insert(holdingSnapshots)
        .values(
          data.holdings.map((h) => ({
            clerkId,
            accountId: acctId,
            snapshotDate: today,
            ticker: h.ticker,
            shares: String(h.shares),
            price: String(h.currentPrice),
            value: String(h.currentValue),
          }))
        )
        .onConflictDoUpdate({
          target: [holdingSnapshots.accountId, holdingSnapshots.snapshotDate, holdingSnapshots.ticker],
          set: {
            shares: sql`excluded.shares`,
            price: sql`excluded.price`,
            value: sql`excluded.value`,
          },
        });
    }

    const rollup = rollupBasis(data.holdings);
    const gl = gainLossFor(data.value, rollup.basis);
    await db.insert(accountSnapshots).values({
      clerkId,
      accountId: acctId,
      snapshotDate: today,
      value: String(data.value),
      costBasis: rollup.basis === null ? null : String(rollup.basis),
      gainLoss: gl ? String(gl.gainLoss) : null,
      gainLossPct: gl ? String(gl.gainLossPct) : null,
    });
  }


  // Step 3: Net worth snapshot (pass investment total so we don't re-query)
  try {
    await snapshotNetWorth(clerkId, totalValue);
  } catch (e) {
    console.error(`Net worth snapshot failed for ${clerkId}:`, e);
  }

  // Step 4: Generate alerts based on fresh data
  try {
    await generateAlerts(clerkId);
  } catch (e) {
    console.error(`Alert generation failed for ${clerkId}:`, e);
  }

  /**
   * Step 5: Close goals whose linked accounts have reached the target.
   *
   * This step used to write the household's portfolio value into
   * `currentAmount` on EVERY goal and set `isCompleted` from it, so a goal
   * to clear $31,200 of debt completed itself the moment the portfolio
   * passed $31,200 — while the household carried $78,116.19. Progress is
   * now derived from each goal's own links and nothing is written here but
   * the closure.
   *
   * Closure is latched once and never cleared: a payoff goal that re-opened
   * when a card was charged would erase the fact that it was ever met, and
   * debt accrued afterwards belongs to a new goal.
   */
  try {
    for (const goal of await findGoalsToClose(clerkId)) {
      await db
        .update(goalsTable)
        .set({ closedAt: new Date(), updatedAt: new Date() })
        .where(eq(goalsTable.id, goal.id));
    }
  } catch (e) {
    console.error(`Goal close check failed for ${clerkId}:`, e);
  }

  return { snapshotted: true, pricesUpdated };
}

/**
 * Snapshot every household, each on its own: one household's failure stops
 * only that household. An uncaught error used to end the run, so every
 * household after it went without a snapshot while the job still looked as
 * if it had run.
 */
export async function snapshotHouseholds(
  clerkIds: string[],
  today: string,
  one: typeof snapshotHousehold = snapshotHousehold
): Promise<{ snapshotted: number; failed: number; pricesUpdated: number }> {
  let snapshotted = 0;
  let failed = 0;
  let pricesUpdated = 0;
  for (const clerkId of clerkIds) {
    try {
      const r = await one(clerkId, today);
      if (r.snapshotted) snapshotted++;
      pricesUpdated += r.pricesUpdated;
    } catch (e) {
      failed++;
      console.error("Snapshot failed for a household:", e);
    }
  }
  return { snapshotted, failed, pricesUpdated };
}
