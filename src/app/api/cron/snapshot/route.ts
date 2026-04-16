import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { accounts, holdings, portfolioSnapshots } from "@/lib/db/schema";
import { calculateAllocation } from "@/lib/utils/calculations";
import { getLatestSnapshot } from "@/lib/queries/snapshots";
import { updateAllPrices } from "@/lib/utils/price-feed";
import { generateAlerts } from "@/lib/utils/alert-generator";

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = getDb();

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

    snapshotsCreated++;

    // Step 3: Generate alerts based on fresh data
    try {
      await generateAlerts(clerkId);
    } catch (e) {
      console.error(`Alert generation failed for ${clerkId}:`, e);
    }

    // Step 4: Update goal progress
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

  return Response.json({
    success: true,
    snapshotsCreated,
    pricesUpdated: totalPricesUpdated,
    date: today,
  });
}
