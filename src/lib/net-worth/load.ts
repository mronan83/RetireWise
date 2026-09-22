import { eq, sql } from "drizzle-orm";
import { getDb } from "../db";
import { accounts, cashReserves, debts, holdings, realEstate, vehicles } from "../db/schema";
import {
  composeNetWorth,
  type ComposableAsset,
  type ComposableLiability,
  type NetWorth,
} from "./compose";

/**
 * The household's net worth, composed once.
 *
 * This arithmetic used to be written out three times — the net worth page, the
 * dashboard and the infographic route each summed it in their own words. They
 * agreed, which is the only reason the double-counted car loans looked like a
 * real drop rather than a bug in one of them.
 */
export async function loadNetWorth(clerkId: string): Promise<NetWorth> {
  const db = getDb();

  const [investmentRows, cashRows, propertyRows, vehicleRows, debtRows] = await Promise.all([
    db
      .select({ total: sql<string>`coalesce(sum(${holdings.currentValue}), 0)` })
      .from(holdings)
      .innerJoin(accounts, eq(holdings.accountId, accounts.id))
      .where(eq(accounts.clerkId, clerkId)),
    db.select().from(cashReserves).where(eq(cashReserves.clerkId, clerkId)),
    db.select().from(realEstate).where(eq(realEstate.clerkId, clerkId)),
    db.select().from(vehicles).where(eq(vehicles.clerkId, clerkId)),
    db.select().from(debts).where(eq(debts.clerkId, clerkId)),
  ]);

  const assets: ComposableAsset[] = [
    ...propertyRows.map<ComposableAsset>((p) => ({
      kind: "real_estate",
      id: p.id,
      name: p.name,
      value: Number(p.estimatedValue),
      embeddedLoan: Number(p.mortgageBalance ?? 0),
      embeddedRate: p.mortgageRate === null ? null : Number(p.mortgageRate),
      embeddedPayment: p.monthlyPayment === null ? null : Number(p.monthlyPayment),
    })),
    ...vehicleRows.map<ComposableAsset>((v) => ({
      kind: "vehicle",
      id: v.id,
      name: v.name,
      value: Number(v.estimatedValue),
      // hasLoan false means there is no loan, whatever is left in the column.
      embeddedLoan: v.hasLoan ? Number(v.loanBalance ?? 0) : 0,
      embeddedRate: v.loanRate === null ? null : Number(v.loanRate),
      embeddedPayment: v.loanMonthlyPayment === null ? null : Number(v.loanMonthlyPayment),
    })),
  ];

  const liabilities: ComposableLiability[] = debtRows.map((d) => ({
    id: d.id,
    name: d.name,
    balance: Number(d.currentBalance),
    debtType: d.debtType,
    securedByType: d.securedByType,
    securedById: d.securedById,
    fromPlaid: d.plaidAccountId !== null,
    rate: Number(d.interestRate),
    monthlyPayment: Number(d.monthlyPayment),
  }));

  return composeNetWorth({
    investments: Number(investmentRows[0]?.total ?? 0),
    cash: cashRows.reduce((s, c) => s + Number(c.balance), 0),
    assets,
    liabilities,
  });
}
