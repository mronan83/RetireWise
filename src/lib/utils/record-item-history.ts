import { eq, and } from "drizzle-orm";
import { getDb } from "../db";
import { netWorthItemHistory } from "../db/schema";

export type ItemType = "real_estate" | "cash_reserve" | "vehicle" | "debt";

/**
 * Upserts today's value record for a single net worth item.
 * Uses delete-then-insert so we get the latest value if called
 * multiple times on the same day.
 */
export async function recordItemHistory(
  clerkId: string,
  itemType: ItemType,
  itemId: string,
  itemName: string,
  value: number,
  secondaryValue?: number
) {
  const db = getDb();
  const today = new Date().toISOString().split("T")[0];

  // Delete any existing record for this item+date
  await db
    .delete(netWorthItemHistory)
    .where(
      and(
        eq(netWorthItemHistory.itemId, itemId),
        eq(netWorthItemHistory.recordedDate, today)
      )
    );

  await db.insert(netWorthItemHistory).values({
    clerkId,
    itemType,
    itemId,
    itemName,
    recordedDate: today,
    value: String(value),
    secondaryValue: secondaryValue !== undefined ? String(secondaryValue) : null,
  });
}
