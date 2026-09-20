"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requireWriteClerkId, withWriteHousehold } from "@/lib/auth-helpers";
import { getDb } from "../db";
import { accounts, holdings, plaidItems } from "../db/schema";

/**
 * Fold a newly linked Plaid account into the hand-entered account it turned
 * out to be a copy of.
 *
 * The manual row is kept rather than the Plaid one. It is the row the user
 * named, assigned an owner, and flagged as contributing or not, and it is the
 * row that snapshots, transactions and contributions already reference — so
 * keeping it preserves the history, while the Plaid linkage and the live
 * holdings move onto it.
 */
export async function mergeLinkedAccount(
  ...args: Parameters<typeof mergeLinkedAccountImpl>
) {
  return withWriteHousehold(() => mergeLinkedAccountImpl(...args));
}

async function mergeLinkedAccountImpl(
  linkedAccountId: string,
  manualAccountId: string
) {
  const clerkId = await requireWriteClerkId();
  if (linkedAccountId === manualAccountId) {
    throw new Error("Pick two different accounts.");
  }

  const db = getDb();
  const owned = await db
    .select()
    .from(accounts)
    .where(eq(accounts.clerkId, clerkId));

  const linked = owned.find((a) => a.id === linkedAccountId);
  const manual = owned.find((a) => a.id === manualAccountId);

  if (!linked || !manual) throw new Error("Account not found");
  if (!linked.plaidAccountId) {
    throw new Error("The first account is not connected to Plaid.");
  }
  if (manual.plaidAccountId) {
    throw new Error("The second account is already connected to Plaid.");
  }

  // Plaid's holdings replace whatever was typed or imported for this account.
  await db.delete(holdings).where(eq(holdings.accountId, manual.id));
  await db
    .update(holdings)
    .set({ accountId: manual.id, updatedAt: new Date() })
    .where(eq(holdings.accountId, linked.id));

  await db
    .update(accounts)
    .set({
      plaidItemId: linked.plaidItemId,
      plaidAccountId: linked.plaidAccountId,
      dataSource: "plaid",
      accountType: linked.accountType,
      taxTreatment: linked.taxTreatment,
      updatedAt: new Date(),
    })
    .where(eq(accounts.id, manual.id));

  await db.delete(accounts).where(eq(accounts.id, linked.id));

  revalidatePath("/dashboard");
  revalidatePath("/accounts");
  revalidatePath("/holdings");

  return { merged: true, keptAccountId: manual.id };
}

/**
 * Stop an account updating from Plaid, keeping the holdings as they stand.
 *
 * The figures already imported stay and become editable again, so the account
 * simply reverts to being maintained by hand.
 */
export async function disconnectAccount(
  ...args: Parameters<typeof disconnectAccountImpl>
) {
  return withWriteHousehold(() => disconnectAccountImpl(...args));
}

async function disconnectAccountImpl(accountId: string) {
  const clerkId = await requireWriteClerkId();
  const db = getDb();

  const [account] = await db
    .select()
    .from(accounts)
    .where(and(eq(accounts.id, accountId), eq(accounts.clerkId, clerkId)))
    .limit(1);

  if (!account) throw new Error("Account not found");

  await db
    .update(accounts)
    .set({
      plaidItemId: null,
      plaidAccountId: null,
      dataSource: "manual",
      updatedAt: new Date(),
    })
    .where(eq(accounts.id, account.id));

  await db
    .update(holdings)
    .set({ dataSource: "manual", updatedAt: new Date() })
    .where(eq(holdings.accountId, account.id));

  // An item with no accounts left pointing at it should stop being refreshed.
  if (account.plaidItemId) {
    const remaining = await db
      .select({ id: accounts.id })
      .from(accounts)
      .where(
        and(
          eq(accounts.clerkId, clerkId),
          eq(accounts.plaidItemId, account.plaidItemId)
        )
      );

    if (remaining.length === 0) {
      await db
        .delete(plaidItems)
        .where(
          and(
            eq(plaidItems.clerkId, clerkId),
            eq(plaidItems.itemId, account.plaidItemId)
          )
        );
    }
  }

  revalidatePath("/dashboard");
  revalidatePath("/accounts");
  revalidatePath("/holdings");

  return { disconnected: true };
}
