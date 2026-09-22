import { and, eq, gte, inArray } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { getDb } from "../db";
import { accounts, holdings, transactions } from "../db/schema";
import {
  addDays,
  WINDOW_DAYS,
  type AccountWindow,
  type DistributionRow,
} from "../utils/dividends";

/**
 * The distribution record, and how far back each account's record goes.
 *
 * Two facts, fetched together because neither means anything alone: a year
 * with no distributions in it is either an account that paid none or an
 * account linked last week, and only the earliest transaction of ANY type
 * tells the two apart.
 */
export async function getDividendRecord(clerkId: string, asOf: string) {
  const db = getDb();
  // Fetched from a little before the window so a row dated on the boundary
  // is not lost to a timezone rounding a day either way; the summary filters
  // to the exact window itself.
  const from = addDays(asOf, -(WINDOW_DAYS + 5));

  const owned = await db
    .select({
      id: accounts.id,
      name: accounts.name,
      owner: accounts.owner,
    })
    .from(accounts)
    .where(eq(accounts.clerkId, clerkId));

  if (owned.length === 0) {
    return { rows: [] as DistributionRow[], accounts: [] as AccountWindow[] };
  }

  const ids = owned.map((a) => a.id);

  const [rows, spans, values] = await Promise.all([
    db
      .select({
        accountId: transactions.accountId,
        date: transactions.date,
        amount: transactions.amount,
        ticker: transactions.ticker,
        plaidSecurityId: transactions.plaidSecurityId,
        description: transactions.description,
        shares: transactions.shares,
      })
      .from(transactions)
      .where(
        and(
          inArray(transactions.accountId, ids),
          eq(transactions.type, "dividend"),
          gte(transactions.date, from)
        )
      ),
    // The oldest transaction of any type, which is where the record begins.
    db
      .select({
        accountId: transactions.accountId,
        earliest: sql<string | null>`min(${transactions.date})`,
      })
      .from(transactions)
      .where(inArray(transactions.accountId, ids))
      .groupBy(transactions.accountId),
    db
      .select({
        accountId: holdings.accountId,
        value: sql<string>`coalesce(sum(${holdings.currentValue}), 0)`,
      })
      .from(holdings)
      .where(inArray(holdings.accountId, ids))
      .groupBy(holdings.accountId),
  ]);

  const earliestBy = new Map(spans.map((s) => [s.accountId, s.earliest]));
  const valueBy = new Map(values.map((v) => [v.accountId, Number(v.value)]));

  return {
    rows: rows as DistributionRow[],
    accounts: owned.map<AccountWindow>((a) => ({
      accountId: a.id,
      name: a.name,
      owner: a.owner,
      earliestTxn: earliestBy.get(a.id) ?? null,
      value: valueBy.get(a.id) ?? 0,
    })),
  };
}
