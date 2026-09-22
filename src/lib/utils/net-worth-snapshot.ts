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
import { composeNetWorth } from "../net-worth/compose";

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

  /**
   * Composed in src/lib/net-worth/compose.ts, the same way the pages do it.
   *
   * This block summed net worth in its own words — the fourth place that did,
   * and the one that outlived the other three being consolidated. It netted
   * each asset's own loan figure out of its equity and then subtracted the
   * whole debts table on top, so the day a bank connection brought in loans
   * already typed onto the assets, the chart recorded a fall of $236,191.73
   * that never happened while the card beside it read correctly.
   */
  const composed = composeNetWorth({
    investments,
    cash: cash.reduce((s, c) => s + Number(c.balance), 0),
    assets: [
      ...properties.map((p) => ({
        kind: "real_estate" as const,
        id: p.id,
        name: p.name,
        value: Number(p.estimatedValue),
        embeddedLoan: Number(p.mortgageBalance ?? 0),
      })),
      ...vehiclesList.map((v) => ({
        kind: "vehicle" as const,
        id: v.id,
        name: v.name,
        value: Number(v.estimatedValue),
        embeddedLoan: v.hasLoan ? Number(v.loanBalance ?? 0) : 0,
      })),
    ],
    liabilities: debtsList.map((d) => ({
      id: d.id,
      name: d.name,
      balance: Number(d.currentBalance),
      debtType: d.debtType,
      securedByType: d.securedByType,
      securedById: d.securedById,
      fromPlaid: d.plaidAccountId !== null,
    })),
  });

  const realEstateEquity = composed.assets
    .filter((a) => a.kind === "real_estate")
    .reduce((s, a) => s + a.equity, 0);
  const vehicleEquity = composed.assets
    .filter((a) => a.kind === "vehicle")
    .reduce((s, a) => s + a.equity, 0);
  const realEstateValue = composed.assets
    .filter((a) => a.kind === "real_estate")
    .reduce((s, a) => s + a.value, 0);
  const vehicleValue = composed.assets
    .filter((a) => a.kind === "vehicle")
    .reduce((s, a) => s + a.value, 0);
  const cashTotal = composed.cash;
  const netWorth = composed.netWorth;

  /**
   * Both bases, so a row can answer either question later.
   *
   * `totalAssets` and `totalDebts` stay on the equity basis the column names
   * were written for — asset equity, and only the debts not netted out of it.
   * The three columns added in 0019 record the other side: full asset value,
   * and what is secured against those assets. Gross assets less everything
   * owed gives the same net worth, to the cent, and only that pairing can be
   * put on a screen labelled "Total Debts" without lying.
   */
  const securedDebts = composed.secured;
  const totalDebts = composed.unsecured;
  const totalAssets = investments + realEstateEquity + cashTotal + vehicleEquity;

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
    realEstateValue: String(realEstateValue),
    vehicleValue: String(vehicleValue),
    securedDebts: String(securedDebts),
  });
}
