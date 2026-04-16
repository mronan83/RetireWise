"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { eq, and } from "drizzle-orm";
import { getDb } from "../db";
import { holdings, accounts } from "../db/schema";
import type { ParsedHolding } from "../utils/csv-parser";

export async function importHoldings(
  accountId: string,
  parsedHoldings: ParsedHolding[]
) {
  const { userId } = await auth();
  if (!userId) throw new Error("Unauthorized");

  const db = getDb();
  const account = await db
    .select({ id: accounts.id })
    .from(accounts)
    .where(and(eq(accounts.id, accountId), eq(accounts.clerkId, userId)))
    .limit(1);

  if (account.length === 0) throw new Error("Account not found");

  const values = parsedHoldings.map((h) => ({
    accountId,
    ticker: h.ticker,
    name: h.name,
    assetClass: h.assetClass as
      | "us_stock"
      | "intl_stock"
      | "bond"
      | "reit"
      | "commodity"
      | "crypto"
      | "cash"
      | "other",
    shares: String(h.shares),
    costBasisPerShare: String(h.costBasisPerShare),
    currentPrice: String(h.currentPrice),
    currentValue: String(h.shares * h.currentPrice),
    dataSource: "csv_import" as const,
    lastPriceUpdate: new Date(),
  }));

  if (values.length > 0) {
    await db.insert(holdings).values(values);
  }

  revalidatePath("/dashboard");
  revalidatePath("/holdings");
  revalidatePath(`/accounts/${accountId}`);

  return { imported: values.length };
}

/**
 * Smart refresh: updates existing holdings by ticker, adds new ones,
 * removes holdings that are no longer in the CSV (sold positions).
 */
export async function refreshHoldings(
  accountId: string,
  parsedHoldings: ParsedHolding[]
) {
  const { userId } = await auth();
  if (!userId) throw new Error("Unauthorized");

  const db = getDb();
  const account = await db
    .select({ id: accounts.id })
    .from(accounts)
    .where(and(eq(accounts.id, accountId), eq(accounts.clerkId, userId)))
    .limit(1);

  if (account.length === 0) throw new Error("Account not found");

  // Get existing holdings for this account
  const existing = await db
    .select()
    .from(holdings)
    .where(eq(holdings.accountId, accountId));

  const existingByTicker = new Map(existing.map((h) => [h.ticker, h]));
  const incomingTickers = new Set(parsedHoldings.map((h) => h.ticker));

  let updated = 0;
  let added = 0;
  let removed = 0;

  // Update existing or add new
  for (const parsed of parsedHoldings) {
    const match = existingByTicker.get(parsed.ticker);

    if (match) {
      // Update existing holding
      await db
        .update(holdings)
        .set({
          name: parsed.name,
          assetClass: parsed.assetClass as
            | "us_stock"
            | "intl_stock"
            | "bond"
            | "reit"
            | "commodity"
            | "crypto"
            | "cash"
            | "other",
          shares: String(parsed.shares),
          costBasisPerShare: String(parsed.costBasisPerShare),
          currentPrice: String(parsed.currentPrice),
          currentValue: String(parsed.shares * parsed.currentPrice),
          lastPriceUpdate: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(holdings.id, match.id));
      updated++;
    } else {
      // Add new holding
      await db.insert(holdings).values({
        accountId,
        ticker: parsed.ticker,
        name: parsed.name,
        assetClass: parsed.assetClass as
          | "us_stock"
          | "intl_stock"
          | "bond"
          | "reit"
          | "commodity"
          | "crypto"
          | "cash"
          | "other",
        shares: String(parsed.shares),
        costBasisPerShare: String(parsed.costBasisPerShare),
        currentPrice: String(parsed.currentPrice),
        currentValue: String(parsed.shares * parsed.currentPrice),
        dataSource: "csv_import",
        lastPriceUpdate: new Date(),
      });
      added++;
    }
  }

  // Remove holdings no longer in CSV (sold positions)
  for (const [ticker, holding] of existingByTicker) {
    if (!incomingTickers.has(ticker)) {
      await db.delete(holdings).where(eq(holdings.id, holding.id));
      removed++;
    }
  }

  revalidatePath("/dashboard");
  revalidatePath("/holdings");
  revalidatePath(`/accounts/${accountId}`);

  return { updated, added, removed };
}
