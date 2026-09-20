import { eq, desc, and, gte, asc } from "drizzle-orm";
import { getDb } from "../db";
import { portfolioSnapshots, accountSnapshots, netWorthSnapshots, netWorthItemHistory } from "../db/schema";

/**
 * Fetch all item history records for a user, ordered by date ASC.
 * Returns a Map<itemId, HistoryPoint[]> for easy lookup.
 */
export async function getItemHistoryMap(clerkId: string): Promise<
  Map<string, { recordedDate: string; value: string; secondaryValue: string | null }[]>
> {
  const db = getDb();
  const rows = await db
    .select({
      itemId: netWorthItemHistory.itemId,
      recordedDate: netWorthItemHistory.recordedDate,
      value: netWorthItemHistory.value,
      secondaryValue: netWorthItemHistory.secondaryValue,
    })
    .from(netWorthItemHistory)
    .where(eq(netWorthItemHistory.clerkId, clerkId))
    .orderBy(asc(netWorthItemHistory.recordedDate));

  const map = new Map<string, { recordedDate: string; value: string; secondaryValue: string | null }[]>();
  for (const row of rows) {
    const list = map.get(row.itemId) || [];
    list.push({ recordedDate: row.recordedDate, value: row.value, secondaryValue: row.secondaryValue });
    map.set(row.itemId, list);
  }
  return map;
}

export async function getNetWorthSnapshots(clerkId: string, limit = 365) {
  const db = getDb();
  return db
    .select()
    .from(netWorthSnapshots)
    .where(eq(netWorthSnapshots.clerkId, clerkId))
    .orderBy(asc(netWorthSnapshots.snapshotDate))
    .limit(limit);
}

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
/**
 * How late a boundary snapshot may be and still count.
 *
 * A period boundary can fall on a weekend or a market holiday, when no
 * snapshot is taken. This covers that gap and not a missing year.
 */
const GRACE_DAYS = 7;

function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().split("T")[0];
}

export type AccountPerformance = {
  /** Percent change per period key. Null where the history cannot reach it. */
  returns: Record<string, number | null>;
  /**
   * The first date this account was ever snapshotted.
   *
   * Carried so the card can label the inception-to-date figure with the
   * date it actually starts from, instead of borrowing a period name the
   * record does not cover.
   */
  since: string | null;
};

export async function getAccountPerformanceMap(clerkId: string): Promise<
  Map<string, AccountPerformance>
> {
  const db = getDb();
  const now = new Date();
  const today = now.toISOString().split("T")[0];

  // Calculate boundary dates
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const ytdStart = `${now.getFullYear()}-01-01`;
  // Short windows, because five months of daily snapshots can answer these
  // honestly while "1Y" and everything above it cannot.
  const thirtyDaysAgo = new Date(now);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const ninetyDaysAgo = new Date(now);
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
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
  const result = new Map<string, AccountPerformance>();
  const iso = (d: Date) => d.toISOString().split("T")[0];

  for (const [accountId, snaps] of byAccount) {
    if (snaps.length === 0) continue;
    const latest = snaps[snaps.length - 1];
    const latestVal = latest.value;
    const earliest = snaps[0];

    /**
     * The value at a date, or null when the history does not reach it.
     *
     * This returned "the first snapshot on or after the target", with no
     * check that any snapshot preceded the target at all. An account with
     * five months of history therefore answered the 10-year question with
     * its oldest row — so "10Y", "5Y", "3Y" and "1Y" all showed the same
     * five-month number, each under a label claiming a period the app had
     * never observed. Nothing looked broken: the figures were small,
     * plausible, and identical to one another.
     *
     * GRACE_DAYS exists because a target date can land on a weekend or a
     * market holiday, when no snapshot is taken. It absorbs that and
     * nothing more.
     */
    function valueAt(targetDate: string): number | null {
      if (earliest.date > addDays(targetDate, GRACE_DAYS)) return null;
      const snap = snaps.find((s) => s.date >= targetDate);
      return snap ? snap.value : null;
    }

    function calcReturn(startVal: number | null): number | null {
      if (startVal === null || startVal === 0) return null;
      return ((latestVal - startVal) / startVal) * 100;
    }

    /**
     * Daily change, only when the previous snapshot is actually recent.
     *
     * snaps[length - 2] is the previous ROW, not the previous day. After a
     * weekend, an outage, or a spell of failed cron runs it can be weeks
     * back, and the move over those weeks was being labelled "Day".
     */
    const prevSnap = snaps.length >= 2 ? snaps[snaps.length - 2] : null;
    const daily =
      prevSnap && prevSnap.value > 0 && latest.date <= addDays(prevSnap.date, GRACE_DAYS)
        ? ((latestVal - prevSnap.value) / prevSnap.value) * 100
        : null;

    /**
     * Inception to date: the one period the record can always answer.
     *
     * Without it a household in its first year sees an empty row, which is
     * honest and useless. Labelled with the start date on the card, so it
     * states its own scope rather than borrowing a period name.
     */
    const inception =
      snaps.length >= 2 && earliest.value > 0
        ? ((latestVal - earliest.value) / earliest.value) * 100
        : null;

    result.set(accountId, {
      returns: {
        daily,
        "30d": calcReturn(valueAt(iso(thirtyDaysAgo))),
        "90d": calcReturn(valueAt(iso(ninetyDaysAgo))),
        ytd: calcReturn(valueAt(ytdStart)),
        "1yr": calcReturn(valueAt(iso(oneYearAgo))),
        "3yr": calcReturn(valueAt(iso(threeYearsAgo))),
        "5yr": calcReturn(valueAt(iso(fiveYearsAgo))),
        "10yr": calcReturn(valueAt(iso(tenYearsAgo))),
        inception,
      },
      since: earliest.date,
    });
  }

  return result;
}
