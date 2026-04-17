"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { eq, and } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "../db";
import { holdings, accounts } from "../db/schema";

const holdingSchema = z.object({
  accountId: z.string().uuid(),
  ticker: z.string().min(1, "Ticker is required").toUpperCase(),
  name: z.string().min(1, "Name is required"),
  assetClass: z.enum([
    "us_stock",
    "intl_stock",
    "bond",
    "reit",
    "commodity",
    "crypto",
    "cash",
    "other",
  ]),
  shares: z.coerce.number().positive("Shares must be positive"),
  costBasisPerShare: z.coerce.number().min(0, "Cost basis must be non-negative"),
  currentPrice: z.coerce.number().min(0, "Price must be non-negative"),
});

export async function createHolding(formData: FormData) {
  const { userId } = await auth();
  if (!userId) throw new Error("Unauthorized");

  const parsed = holdingSchema.parse({
    accountId: formData.get("accountId"),
    ticker: formData.get("ticker"),
    name: formData.get("name"),
    assetClass: formData.get("assetClass"),
    shares: formData.get("shares"),
    costBasisPerShare: formData.get("costBasisPerShare"),
    currentPrice: formData.get("currentPrice"),
  });

  // Verify account ownership
  const db = getDb();
  const account = await db
    .select({ id: accounts.id })
    .from(accounts)
    .where(and(eq(accounts.id, parsed.accountId), eq(accounts.clerkId, userId)))
    .limit(1);

  if (account.length === 0) throw new Error("Account not found");

  const currentValue = parsed.shares * parsed.currentPrice;

  await db.insert(holdings).values({
    accountId: parsed.accountId,
    ticker: parsed.ticker,
    name: parsed.name,
    assetClass: parsed.assetClass,
    shares: String(parsed.shares),
    costBasisPerShare: String(parsed.costBasisPerShare),
    currentPrice: String(parsed.currentPrice),
    currentValue: String(currentValue),
    lastPriceUpdate: new Date(),
  });

  revalidatePath("/dashboard");
  revalidatePath("/holdings");
  revalidatePath(`/accounts/${parsed.accountId}`);
}

export async function updateHolding(id: string, formData: FormData) {
  const { userId } = await auth();
  if (!userId) throw new Error("Unauthorized");

  const parsed = holdingSchema.parse({
    accountId: formData.get("accountId"),
    ticker: formData.get("ticker"),
    name: formData.get("name"),
    assetClass: formData.get("assetClass"),
    shares: formData.get("shares"),
    costBasisPerShare: formData.get("costBasisPerShare"),
    currentPrice: formData.get("currentPrice"),
  });

  const currentValue = parsed.shares * parsed.currentPrice;

  // Verify the holding belongs to an account owned by this user
  const db = getDb();
  const holding = await db
    .select({ accountId: holdings.accountId })
    .from(holdings)
    .innerJoin(accounts, eq(holdings.accountId, accounts.id))
    .where(and(eq(holdings.id, id), eq(accounts.clerkId, userId)))
    .limit(1);
  if (holding.length === 0) throw new Error("Holding not found");

  await db
    .update(holdings)
    .set({
      ticker: parsed.ticker,
      name: parsed.name,
      assetClass: parsed.assetClass,
      shares: String(parsed.shares),
      costBasisPerShare: String(parsed.costBasisPerShare),
      currentPrice: String(parsed.currentPrice),
      currentValue: String(currentValue),
      lastPriceUpdate: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(holdings.id, id));

  revalidatePath("/dashboard");
  revalidatePath("/holdings");
  revalidatePath(`/accounts/${parsed.accountId}`);
}

export async function deleteHolding(id: string, accountId: string) {
  const { userId } = await auth();
  if (!userId) throw new Error("Unauthorized");

  // Verify ownership before deleting
  const db = getDb();
  const holding = await db
    .select({ id: holdings.id })
    .from(holdings)
    .innerJoin(accounts, eq(holdings.accountId, accounts.id))
    .where(and(eq(holdings.id, id), eq(accounts.clerkId, userId)))
    .limit(1);
  if (holding.length === 0) throw new Error("Holding not found");

  await db.delete(holdings).where(eq(holdings.id, id));

  revalidatePath("/dashboard");
  revalidatePath("/holdings");
  revalidatePath(`/accounts/${accountId}`);
}
