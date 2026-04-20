import { eq, desc, and, gte, asc } from "drizzle-orm";
import { getDb } from "../db";
import { portfolioSnapshots, accountSnapshots } from "../db/schema";

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

// ─── Per-Account Snapshots ───────────────────────────────────

/**
 * Get the oldest snapshot for each account belonging to a user, on or after a given date.
 * Used to calculate time-period returns (e.g., "value at start of year" for YTD).
 */
export async function getAccountSnapshotsAt(clerkId: string, onOrAfterDate: string) {
  const db = getDb();
  // Get the earliest snapshot on or after the date for each account
  return db
    .select()
    .from(accountSnapshots)
    .where(
      and(
        eq(accountSnapshots.clerkId, clerkId),
        gte(accountSnapshots.snapshotDate, onOrAfterDate)
      )
    )
    .orderBy(asc(accountSnapshots.snapshotDate));
}

/**
 * Get the latest account snapshot for each account (most recent day).
 */
export async function getLatestAccountSnapshots(clerkId: string) {
  const db = getDb();
  return db
    .select()
    .from(accountSnapshots)
    .where(eq(accountSnapshots.clerkId, clerkId))
    .orderBy(desc(accountSnapshots.snapshotDate))
    .limit(200); // generous upper bound — latest snapshots for all accounts
}

/**
 * Build per-account performance data for time periods.
 * Returns a map of accountId -> { daily, ytd, 1yr, 3yr, 5yr, 10yr } return percentages.
 */
export async function getAccountPerformanceMap(clerkId: string): Promise<
  Map<string, Record<string, number | null>>
> {
  const db = getDb();
  const now = new Date();
  const today = now.toISOString().split("T")[0];

  // Calculate boundary dates
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const ytdStart = `${now.getFullYear()}-01-01`;
  const oneYearAgo = new Date(now);
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
  const threeYearsAgo = new Date(now);
  threeYearsAgo.setFullYear(threeYearsAgo.getFullYear() - 3);
  const fiveYearsAgo = new Date(now);
  fiveYearsAgo.setFullYear(fiveYearsAgo.getFullYear() - 5);
  const tenYearsAgo = new Date(now);
  tenYearsAgo.setFullYear(tenYearsAgo.getFullYear() - 10);

  // Fetch all account snapshots for this user (ordered by date asc)
  const allSnaps = await db
    .select({
      accountId: accountSnapshots.accountId,
      snapshotDate: accountSnapshots.snapshotDate,
      value: accountSnapshots.value,
    })
    .from(accountSnapshots)
    .where(eq(accountSnapshots.clerkId, clerkId))
    .orderBy(asc(accountSnapshots.snapshotDate));

  // Group by account
  const byAccount = new Map<string, { date: string; value: number }[]>();
  for (const s of allSnaps) {
    const list = byAccount.get(s.accountId) || [];
    list.push({ date: s.snapshotDate, value: Number(s.value) });
    byAccount.set(s.accountId, list);
  }

  // For each account, compute returns
  const result = new Map<string, Record<string, number | null>>();

  for (const [accountId, snaps] of byAccount) {
    if (snaps.length === 0) continue;
    const latest = snaps[snaps.length - 1];
    const latestVal = latest.value;

    function findClosest(targetDate: string): number | null {
      // Find the first snapshot on or after the target date
      const snap = snaps.find((s) => s.date >= targetDate);
      return snap ? snap.value : null;
    }

    function calcReturn(startVal: number | null): number | null {
      if (startVal === null || startVal === 0) return null;
      return ((latestVal - startVal) / startVal) * 100;
    }

    // Daily: compare to second-to-last snapshot
    const prevSnap = snaps.length >= 2 ? snaps[snaps.length - 2] : null;
    const daily = prevSnap && prevSnap.value > 0
      ? ((latestVal - prevSnap.value) / prevSnap.value) * 100
      : null;

    result.set(accountId, {
      daily,
      ytd: calcReturn(findClosest(ytdStart)),
      "1yr": calcReturn(findClosest(oneYearAgo.toISOString().split("T")[0])),
      "3yr": calcReturn(findClosest(threeYearsAgo.toISOString().split("T")[0])),
      "5yr": calcReturn(findClosest(fiveYearsAgo.toISOString().split("T")[0])),
      "10yr": calcReturn(findClosest(tenYearsAgo.toISOString().split("T")[0])),
    });
  }

  return result;
}
