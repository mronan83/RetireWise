"use server";

import { requireWriteClerkId, withWriteHousehold } from "@/lib/auth-helpers";
import { revalidatePath } from "next/cache";
import { eq, and } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "../db";
import { holdings, accounts } from "../db/schema";
import { recordAudit } from "../audit";
import { typedPriceUpdate } from "../utils/market-session";

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

export async function createHolding(
  ...args: Parameters<typeof createHoldingImpl>
) {
  return withWriteHousehold(() => createHoldingImpl(...args));
}

async function createHoldingImpl(formData: FormData) {
  // Rows are keyed by the household id, not the signed-in account's own id.
  const userId = await requireWriteClerkId();

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

export async function updateHolding(
  ...args: Parameters<typeof updateHoldingImpl>
) {
  return withWriteHousehold(() => updateHoldingImpl(...args));
}

async function updateHoldingImpl(id: string, formData: FormData) {
  // Rows are keyed by the household id, not the signed-in account's own id.
  const userId = await requireWriteClerkId();

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
    .select({ accountId: holdings.accountId, currentPrice: holdings.currentPrice })
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
      ...typedPriceUpdate(parsed.currentPrice, holding[0].currentPrice),
      updatedAt: new Date(),
    })
    .where(eq(holdings.id, id));

  revalidatePath("/dashboard");
  revalidatePath("/holdings");
  revalidatePath(`/accounts/${parsed.accountId}`);
}

export async function deleteHolding(
  ...args: Parameters<typeof deleteHoldingImpl>
) {
  return withWriteHousehold(() => deleteHoldingImpl(...args));
}

async function deleteHoldingImpl(id: string, accountId: string) {
  // Rows are keyed by the household id, not the signed-in account's own id.
  const userId = await requireWriteClerkId();

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

/**
 * Cost basis, entered by hand.
 *
 * Its own action rather than a field on the full holding editor, because a
 * synced position's ticker, shares and price belong to the institution —
 * editing them would be overwritten by the next sync, so offering the edit
 * would be a lie. The basis is the one figure that is genuinely the
 * owner's to supply when the institution does not.
 *
 * Accepts either a per-share figure or a total, because a statement gives
 * one or the other and making someone divide by 604.057 shares is a way to
 * introduce an error the app then presents as fact.
 *
 * Writes `costBasisSource: "manual"`, which the Plaid sync and the
 * transaction-derivation pass both treat as final. That is deliberate: a
 * person reading their own statement is better evidence than an
 * institution that has already declined to answer, and silently replacing
 * their figure is the exact failure this column exists to prevent.
 */
const costBasisSchema = z
  .object({
    holdingId: z.string().uuid(),
    mode: z.enum(["per_share", "total"]),
    amount: z.coerce
      .number()
      .min(0, "Cost basis cannot be negative")
      .finite("Enter a number"),
  })
  .refine((v) => Number.isFinite(v.amount), { message: "Enter a number" });

export async function setCostBasis(
  ...args: Parameters<typeof setCostBasisImpl>
) {
  return withWriteHousehold(() => setCostBasisImpl(...args));
}

async function setCostBasisImpl(formData: FormData) {
  const userId = await requireWriteClerkId();

  const parsed = costBasisSchema.parse({
    holdingId: formData.get("holdingId"),
    mode: formData.get("mode"),
    amount: formData.get("amount"),
  });

  const db = getDb();
  const [holding] = await db
    .select({
      id: holdings.id,
      accountId: holdings.accountId,
      ticker: holdings.ticker,
      shares: holdings.shares,
      previous: holdings.costBasisPerShare,
      previousSource: holdings.costBasisSource,
    })
    .from(holdings)
    .innerJoin(accounts, eq(holdings.accountId, accounts.id))
    .where(and(eq(holdings.id, parsed.holdingId), eq(accounts.clerkId, userId)))
    .limit(1);
  if (!holding) throw new Error("Holding not found");

  const shares = Number(holding.shares);
  if (parsed.mode === "total" && !(shares > 0)) {
    throw new Error("Cannot divide a total by zero shares — enter a per-share figure");
  }
  const perShare = parsed.mode === "total" ? parsed.amount / shares : parsed.amount;

  await db
    .update(holdings)
    .set({
      costBasisPerShare: String(perShare),
      costBasisSource: "manual",
      costBasisUpdatedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(holdings.id, holding.id));

  // A change to a figure every gain on the site is measured against is
  // worth a permanent record, including what it replaced.
  await recordAudit({
    clerkId: userId,
    action: "cost_basis.set",
    entity: "holding",
    entityId: holding.id,
    detail: {
      ticker: holding.ticker,
      shares,
      enteredAs: parsed.mode,
      enteredAmount: parsed.amount,
      costBasisPerShare: perShare,
      previous: holding.previous,
      previousSource: holding.previousSource,
    },
  });

  revalidatePath("/dashboard");
  revalidatePath("/holdings");
  revalidatePath("/accounts");
  revalidatePath(`/accounts/${holding.accountId}`);
}

/**
 * Hand a position back to the institution.
 *
 * Clearing a manual basis restores "unknown" rather than zero, and lets the
 * next sync or derivation fill it if either can. Without this an entry made
 * in error would be permanent, since manual outranks everything else.
 */
export async function clearCostBasis(
  ...args: Parameters<typeof clearCostBasisImpl>
) {
  return withWriteHousehold(() => clearCostBasisImpl(...args));
}

async function clearCostBasisImpl(holdingId: string) {
  const userId = await requireWriteClerkId();
  const db = getDb();

  const [holding] = await db
    .select({
      id: holdings.id,
      accountId: holdings.accountId,
      ticker: holdings.ticker,
      previous: holdings.costBasisPerShare,
    })
    .from(holdings)
    .innerJoin(accounts, eq(holdings.accountId, accounts.id))
    .where(and(eq(holdings.id, holdingId), eq(accounts.clerkId, userId)))
    .limit(1);
  if (!holding) throw new Error("Holding not found");

  await db
    .update(holdings)
    .set({
      costBasisPerShare: null,
      costBasisSource: null,
      costBasisUpdatedAt: null,
      updatedAt: new Date(),
    })
    .where(eq(holdings.id, holding.id));

  await recordAudit({
    clerkId: userId,
    action: "cost_basis.cleared",
    entity: "holding",
    entityId: holding.id,
    detail: { ticker: holding.ticker, previous: holding.previous },
  });

  revalidatePath("/dashboard");
  revalidatePath("/holdings");
  revalidatePath("/accounts");
  revalidatePath(`/accounts/${holding.accountId}`);
}
