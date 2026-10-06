import { eq, desc, and, gte, lt, asc } from "drizzle-orm";
import { getDb } from "../db";
import { portfolioSnapshots, accountSnapshots, holdingSnapshots, netWorthSnapshots, netWorthItemHistory } from "../db/schema";
import { twrSince, timeWeightedReturn, type AccountDay } from "../performance/twr";

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

/**
 * The household's latest snapshot from before a date: what a day's change is
 * measured from. Reading the latest snapshot of all, as the nightly job did,
 * measured a second run on the same day against the first and recorded a
 * change of nothing.
 */
export async function getSnapshotBefore(clerkId: string, date: string) {
  const db = getDb();
  const result = await db
    .select()
    .from(portfolioSnapshots)
    .where(and(eq(portfolioSnapshots.clerkId, clerkId), lt(portfolioSnapshots.snapshotDate, date)))
    .orderBy(desc(portfolioSnapshots.snapshotDate), desc(portfolioSnapshots.createdAt))
    .limit(1);
  return result[0] || null;
}

/**
 * The household's positions at the previous close: the latest weekday-evening
 * snapshot of its positions from before the given market day. The dashboard's
 * daily change measures today's prices against these.
 */
export async function getPreviousClose(clerkId: string, marketDay: string) {
  const db = getDb();
  const [latest] = await db
    .select({ date: holdingSnapshots.snapshotDate })
    .from(holdingSnapshots)
    .where(and(eq(holdingSnapshots.clerkId, clerkId), lt(holdingSnapshots.snapshotDate, marketDay)))
    .orderBy(desc(holdingSnapshots.snapshotDate))
    .limit(1);
  if (!latest) return null;
  const positions = await db
    .select({ accountId: holdingSnapshots.accountId, ticker: holdingSnapshots.ticker, price: holdingSnapshots.price })
    .from(holdingSnapshots)
    .where(and(eq(holdingSnapshots.clerkId, clerkId), eq(holdingSnapshots.snapshotDate, latest.date)));
  return { date: latest.date, positions: positions.map((p) => ({ ...p, price: Number(p.price) })) };
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
  /**
   * Time-weighted return per period key, as a percentage. Null where the
   * history cannot reach the period.
   *
   * A return, not a balance change: money paid in is excluded, so this is
   * how the investments performed rather than how much more is in the
   * account. See lib/performance/twr.ts.
   */
  returns: Record<string, number | null>;
  /**
   * The date from which share counts exist, so flows could be measured.
   *
   * Before it, a contribution is indistinguishable from a gain. Exact for
   * an account receiving no contributions, optimistic for one that is.
   */
  flowsKnownFrom: string | null;
  /** Net external money in (positive) or out, over the whole record. */
  netFlow: number;
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

  const [allSnaps, allPositions] = await Promise.all([
    db
      .select({
        accountId: accountSnapshots.accountId,
        snapshotDate: accountSnapshots.snapshotDate,
        value: accountSnapshots.value,
      })
      .from(accountSnapshots)
      .where(eq(accountSnapshots.clerkId, clerkId))
      .orderBy(asc(accountSnapshots.snapshotDate)),
    db
      .select({
        accountId: holdingSnapshots.accountId,
        snapshotDate: holdingSnapshots.snapshotDate,
        ticker: holdingSnapshots.ticker,
        shares: holdingSnapshots.shares,
        price: holdingSnapshots.price,
      })
      .from(holdingSnapshots)
      .where(eq(holdingSnapshots.clerkId, clerkId))
      .orderBy(asc(holdingSnapshots.snapshotDate)),
  ]);

  // Positions by account and date, so each day can carry the share counts
  // that make its flow measurable.
  const positionsByAccountDate = new Map<string, Map<string, { ticker: string; shares: number; price: number }[]>>();
  for (const p of allPositions) {
    let byDate = positionsByAccountDate.get(p.accountId);
    if (!byDate) {
      byDate = new Map();
      positionsByAccountDate.set(p.accountId, byDate);
    }
    const list = byDate.get(p.snapshotDate) || [];
    list.push({ ticker: p.ticker, shares: Number(p.shares), price: Number(p.price) });
    byDate.set(p.snapshotDate, list);
  }

  // Group by account
  const byAccount = new Map<string, AccountDay[]>();
  for (const s of allSnaps) {
    const list = byAccount.get(s.accountId) || [];
    list.push({
      date: s.snapshotDate,
      value: Number(s.value),
      positions: positionsByAccountDate.get(s.accountId)?.get(s.snapshotDate),
    });
    byAccount.set(s.accountId, list);
  }

  // For each account, compute returns
  const result = new Map<string, AccountPerformance>();
  const iso = (d: Date) => d.toISOString().split("T")[0];

  for (const [accountId, snaps] of byAccount) {
    if (snaps.length === 0) continue;
    const latest = snaps[snaps.length - 1];
    // Retained for the "Since <date>" label; the returns themselves are TWR.
    const earliest = snaps[0];

    /**
     * Time-weighted return over a period, or null when the history does
     * not reach it.
     *
     * Two things changed here. The old version computed
     * (value_now - value_then) / value_then, which is a balance change and
     * counts every contribution as performance. And it found "the first
     * snapshot on or after the target" without checking that any snapshot
     * preceded the target at all — so five months of history answered the
     * ten-year question with its oldest row, and 1Y, 3Y, 5Y and 10Y all
     * showed the same number under four labels.
     *
     * GRACE_DAYS exists because a period boundary can land on a weekend or
     * a market holiday, when no snapshot is taken. It absorbs that and not
     * a missing year.
     */
    function periodReturn(targetDate: string): number | null {
      return twrSince(snaps, targetDate, GRACE_DAYS)?.pct ?? null;
    }

    /**
     * Daily change, only when the previous snapshot is actually recent.
     *
     * snaps[length - 2] is the previous ROW, not the previous day. After a
     * weekend, an outage, or a spell of failed cron runs it can be weeks
     * back, and the move over those weeks was still labelled "Day".
     */
    const prevSnap = snaps.length >= 2 ? snaps[snaps.length - 2] : null;
    const daily =
      prevSnap && latest.date <= addDays(prevSnap.date, GRACE_DAYS)
        ? timeWeightedReturn([prevSnap, latest])?.pct ?? null
        : null;

    /**
     * Inception to date: the one period the record can always answer.
     *
     * Without it a household in its first year sees an empty row, which is
     * honest and useless. Labelled with the start date on the card, so it
     * states its own scope rather than borrowing a period name.
     */
    const whole = timeWeightedReturn(snaps);

    result.set(accountId, {
      returns: {
        daily,
        "30d": periodReturn(iso(thirtyDaysAgo)),
        "90d": periodReturn(iso(ninetyDaysAgo)),
        ytd: periodReturn(ytdStart),
        "1yr": periodReturn(iso(oneYearAgo)),
        "3yr": periodReturn(iso(threeYearsAgo)),
        "5yr": periodReturn(iso(fiveYearsAgo)),
        "10yr": periodReturn(iso(tenYearsAgo)),
        inception: whole?.pct ?? null,
      },
      flowsKnownFrom: whole?.flowsKnownFrom ?? null,
      netFlow: whole?.netFlow ?? 0,
      since: earliest.date,
    });
  }

  return result;
}
