import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { accounts, holdings, portfolioSnapshots, accountSnapshots, holdingSnapshots, cronRuns } from "@/lib/db/schema";
import { calculateAllocation } from "@/lib/utils/calculations";
import { gainLossFor, rollupBasis } from "@/lib/utils/cost-basis";
import { getLatestSnapshot } from "@/lib/queries/snapshots";
import { updateAllPrices } from "@/lib/utils/price-feed";
import { generateAlerts } from "@/lib/utils/alert-generator";
import { snapshotNetWorth } from "@/lib/utils/net-worth-snapshot";
import { withSystemRole } from "@/lib/db/tenant";

export async function GET(request: Request) {
  return withSystemRole(
    "snapshots every household",
    () => handleGet(request)
  );
}

async function handleGet(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = getDb();

  // Recorded so /api/health/freshness can tell "ran and found nothing to do"
  // from "has not run since Tuesday". Without a row, a cron that silently
  // stops looks exactly like one with no work.
  const [run] = await db
    .insert(cronRuns)
    .values({ job: "portfolio_snapshot" })
    .returning({ id: cronRuns.id });

  // Get all unique clerk IDs that have accounts
  const allAccounts = await db
    .select({ clerkId: accounts.clerkId })
    .from(accounts);
  const clerkIds = [...new Set(allAccounts.map((a) => a.clerkId))];

  const today = new Date().toISOString().split("T")[0];
  let snapshotsCreated = 0;
  let totalPricesUpdated = 0;

  for (const clerkId of clerkIds) {
    // Step 1: Update all holding prices from Yahoo Finance
    try {
      const priceResult = await updateAllPrices(clerkId);
      totalPricesUpdated += priceResult.updated;
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
    const accountsData = userHoldings.map((h) => h.accounts);

    const totalValue = holdingsData.reduce(
      (sum, h) => sum + Number(h.currentValue),
      0
    );

    if (totalValue === 0) continue;

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

    // Previous snapshot for daily change
    const prevSnapshot = await getLatestSnapshot(clerkId);
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
          .onConflictDoNothing();
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

    snapshotsCreated++;

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

    // Step 5: Update goal progress
    try {
      const { goals: goalsTable } = await import("@/lib/db/schema");
      const userGoals = await db
        .select()
        .from(goalsTable)
        .where(eq(goalsTable.clerkId, clerkId));

      for (const goal of userGoals) {
        const isCompleted = totalValue >= Number(goal.targetAmount);
        await db
          .update(goalsTable)
          .set({
            currentAmount: String(totalValue),
            isCompleted,
            updatedAt: new Date(),
          })
          .where(eq(goalsTable.id, goal.id));
      }
    } catch (e) {
      console.error(`Goal update failed for ${clerkId}:`, e);
    }
  }

  await db
    .update(cronRuns)
    .set({
      finishedAt: new Date(),
      ok: true,
      processed: snapshotsCreated,
      detail: { pricesUpdated: totalPricesUpdated, date: today },
    })
    .where(eq(cronRuns.id, run.id));

  return Response.json({
    success: true,
    snapshotsCreated,
    pricesUpdated: totalPricesUpdated,
    date: today,
  });
}
