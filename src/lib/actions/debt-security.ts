"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireWriteClerkId, withWriteHousehold } from "@/lib/auth-helpers";
import { getDb } from "../db";
import { debts, realEstate, vehicles } from "../db/schema";
import { recordAudit } from "../audit";

const schema = z.object({
  debtId: z.string().uuid(),
  assetType: z.enum(["real_estate", "vehicle"]),
  assetId: z.string().uuid(),
});

export async function linkDebtToAsset(...args: Parameters<typeof linkImpl>) {
  return withWriteHousehold(() => linkImpl(...args));
}

/**
 * Say which asset a loan is secured against.
 *
 * Once said, the asset's own typed-in loan figure stops being counted and the
 * debt row's balance is used instead — which is what stops the same borrowing
 * being subtracted twice. Audited, because it changes the reported net worth
 * by the size of the loan and the reason should be recoverable later.
 */
async function linkImpl(input: z.infer<typeof schema>) {
  // Rows are keyed by the household id, not the signed-in account's own id.
  const userId = await requireWriteClerkId();
  const parsed = schema.parse(input);

  const db = getDb();

  // The asset has to belong to this household. An id from a form is an id
  // from the client.
  const table = parsed.assetType === "vehicle" ? vehicles : realEstate;
  const owned = await db
    .select({ id: table.id, name: table.name })
    .from(table)
    .where(and(eq(table.id, parsed.assetId), eq(table.clerkId, userId)))
    .limit(1);
  if (owned.length === 0) throw new Error("That asset is not in this household.");

  const updated = await db
    .update(debts)
    .set({
      securedByType: parsed.assetType,
      securedById: parsed.assetId,
      updatedAt: new Date(),
    })
    .where(and(eq(debts.id, parsed.debtId), eq(debts.clerkId, userId)))
    .returning({ id: debts.id, name: debts.name, balance: debts.currentBalance });

  if (updated.length === 0) throw new Error("That debt is not in this household.");

  await recordAudit({
    clerkId: userId,
    action: "debt.secured_by_set",
    entity: "debt",
    entityId: parsed.debtId,
    detail: {
      debt: updated[0].name,
      balance: updated[0].balance,
      asset: owned[0].name,
      assetType: parsed.assetType,
      reason:
        "the asset's own loan figure is now superseded by this balance rather than added to it",
    },
  });

  revalidatePath("/net-worth");
  revalidatePath("/dashboard");
}

export async function unlinkDebtFromAsset(...args: Parameters<typeof unlinkImpl>) {
  return withWriteHousehold(() => unlinkImpl(...args));
}

async function unlinkImpl(debtId: string) {
  // Rows are keyed by the household id, not the signed-in account's own id.
  const userId = await requireWriteClerkId();
  const db = getDb();

  const cleared = await db
    .update(debts)
    .set({ securedByType: null, securedById: null, updatedAt: new Date() })
    .where(and(eq(debts.id, debtId), eq(debts.clerkId, userId)))
    .returning({ name: debts.name });

  if (cleared.length > 0) {
    await recordAudit({
      clerkId: userId,
      action: "debt.secured_by_cleared",
      entity: "debt",
      entityId: debtId,
      detail: { debt: cleared[0].name },
    });
  }

  revalidatePath("/net-worth");
  revalidatePath("/dashboard");
}
