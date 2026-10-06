import { eq, sql } from "drizzle-orm";
import { getDb } from "../db";
import { holdings, accounts } from "../db/schema";

export async function getHoldingsByClerkId(clerkId: string) {
  const db = getDb();
  return db
    .select({
      id: holdings.id,
      accountId: holdings.accountId,
      ticker: holdings.ticker,
      name: holdings.name,
      assetClass: holdings.assetClass,
      shares: holdings.shares,
      costBasisPerShare: holdings.costBasisPerShare,
      costBasisSource: holdings.costBasisSource,
      currentPrice: holdings.currentPrice,
      currentValue: holdings.currentValue,
      lastPriceUpdate: holdings.lastPriceUpdate,
      previousClose: holdings.previousClose,
      dataSource: holdings.dataSource,
      createdAt: holdings.createdAt,
      updatedAt: holdings.updatedAt,
      accountName: accounts.name,
      accountType: accounts.accountType,
      accountTaxTreatment: accounts.taxTreatment,
      accountOwner: accounts.owner,
    })
    .from(holdings)
    .innerJoin(accounts, eq(holdings.accountId, accounts.id))
    .where(eq(accounts.clerkId, clerkId))
    .orderBy(holdings.ticker);
}

export async function getHoldingsByAccountId(accountId: string) {
  const db = getDb();
  return db
    .select()
    .from(holdings)
    .where(eq(holdings.accountId, accountId))
    .orderBy(holdings.ticker);
}

export async function getHoldingById(id: string) {
  const db = getDb();
  const result = await db
    .select()
    .from(holdings)
    .where(eq(holdings.id, id))
    .limit(1);
  return result[0] || null;
}
