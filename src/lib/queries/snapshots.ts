import { eq, desc, and, gte } from "drizzle-orm";
import { getDb } from "../db";
import { portfolioSnapshots } from "../db/schema";

export async function getSnapshots(
  clerkId: string,
  limit = 365
) {
  const db = getDb();
  return db
    .select()
    .from(portfolioSnapshots)
    .where(eq(portfolioSnapshots.clerkId, clerkId))
    .orderBy(desc(portfolioSnapshots.snapshotDate))
    .limit(limit);
}

export async function getLatestSnapshot(clerkId: string) {
  const db = getDb();
  const result = await db
    .select()
    .from(portfolioSnapshots)
    .where(eq(portfolioSnapshots.clerkId, clerkId))
    .orderBy(desc(portfolioSnapshots.snapshotDate))
    .limit(1);
  return result[0] || null;
}

export async function getSnapshotsSince(clerkId: string, sinceDate: string) {
  const db = getDb();
  return db
    .select()
    .from(portfolioSnapshots)
    .where(
      and(
        eq(portfolioSnapshots.clerkId, clerkId),
        gte(portfolioSnapshots.snapshotDate, sinceDate)
      )
    )
    .orderBy(portfolioSnapshots.snapshotDate);
}
