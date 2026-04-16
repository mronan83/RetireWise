import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { accounts, holdings, portfolioSnapshots } from "@/lib/db/schema";
import { calculateAllocation } from "@/lib/utils/calculations";
import { getLatestSnapshot } from "@/lib/queries/snapshots";

export async function GET(request: Request) {
  // Verify cron secret
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = getDb();

  // Get all unique clerk IDs that have accounts
  const allAccounts = await db.select({ clerkId: accounts.clerkId }).from(accounts);
  const clerkIds = [...new Set(allAccounts.map((a) => a.clerkId))];

  const today = new Date().toISOString().split("T")[0];
  let snapshotsCreated = 0;

  for (const clerkId of clerkIds) {
    // Get all holdings for this user
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

    if (totalValue === 0) continue;

    const allocation = calculateAllocation(holdingsData);

    // Get previous snapshot for daily change calc
    const prevSnapshot = await getLatestSnapshot(clerkId);
    const prevValue = prevSnapshot ? Number(prevSnapshot.totalValue) : totalValue;
    const dailyChange = totalValue - prevValue;
    const dailyChangePct = prevValue > 0 ? (dailyChange / prevValue) * 100 : 0;

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
      allocation,
      topHoldings,
      dailyChange: String(dailyChange),
      dailyChangePct: String(dailyChangePct),
    });

    snapshotsCreated++;
  }

  return Response.json({
    success: true,
    snapshotsCreated,
    date: today,
  });
}
