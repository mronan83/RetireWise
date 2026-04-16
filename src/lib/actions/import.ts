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

  // Verify account ownership
  const db = getDb();
  const account = await db
    .select({ id: accounts.id })
    .from(accounts)
    .where(and(eq(accounts.id, accountId), eq(accounts.clerkId, userId)))
    .limit(1);

  if (account.length === 0) throw new Error("Account not found");

  // Insert all holdings
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
