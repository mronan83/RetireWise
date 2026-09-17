import { eq, and, desc } from "drizzle-orm";
import { getDb } from "../db";
import {
  realEstate,
  cashReserves,
  debts,
  vehicles,
  netWorthSnapshots,
  portfolioSnapshots,
} from "../db/schema";

/**
 * Upsert a net worth snapshot for today.
 * Called after any net worth edit and during the nightly cron.
 * Passing investmentValue avoids a DB round-trip when called from the cron
 * (which already has fresh investment totals).
 */
export async function snapshotNetWorth(
  clerkId: string,
  investmentValue?: number
): Promise<void> {
  const db = getDb();
  const today = new Date().toISOString().split("T")[0];

  // Fetch all net worth components in parallel
  const [properties, cash, debtsList, vehiclesList, latestPortfolio] = await Promise.all([
    db.select().from(realEstate).where(eq(realEstate.clerkId, clerkId)),
    db.select().from(cashReserves).where(eq(cashReserves.clerkId, clerkId)),
    db.select().from(debts).where(eq(debts.clerkId, clerkId)),
    db.select().from(vehicles).where(eq(vehicles.clerkId, clerkId)),
    investmentValue === undefined
      ? db
          .select({ totalValue: portfolioSnapshots.totalValue })
          .from(portfolioSnapshots)
          .where(eq(portfolioSnapshots.clerkId, clerkId))
          .orderBy(desc(portfolioSnapshots.snapshotDate))
          .limit(1)
      : Promise.resolve(null),
  ]);

  const investments =
    investmentValue ?? Number(latestPortfolio?.[0]?.totalValue ?? 0);

  const realEstateEquity = properties.reduce(
    (s, p) => s + Number(p.estimatedValue) - Number(p.mortgageBalance || 0),
    0
  );
  const cashTotal = cash.reduce((s, c) => s + Number(c.balance), 0);
  const vehicleEquity = vehiclesList.reduce(
    (s, v) =>
      s + Number(v.estimatedValue) - (v.hasLoan ? Number(v.loanBalance || 0) : 0),
    0
  );
  const totalDebts = debtsList.reduce((s, d) => s + Number(d.currentBalance), 0);
  const totalAssets = investments + realEstateEquity + cashTotal + vehicleEquity;
  const netWorth = totalAssets - totalDebts;

  // Delete any existing snapshot for today, then insert fresh
  await db
    .delete(netWorthSnapshots)
    .where(
      and(
        eq(netWorthSnapshots.clerkId, clerkId),
        eq(netWorthSnapshots.snapshotDate, today)
      )
    );

  await db.insert(netWorthSnapshots).values({
    clerkId,
    snapshotDate: today,
    netWorth: String(netWorth),
    totalAssets: String(totalAssets),
    investmentValue: String(investments),
    realEstateEquity: String(realEstateEquity),
    cashTotal: String(cashTotal),
    vehicleEquity: String(vehicleEquity),
    totalDebts: String(totalDebts),
  });
}
