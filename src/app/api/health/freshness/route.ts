import { desc, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { cronRuns, plaidItems, portfolioSnapshots } from "@/lib/db/schema";
import { withSystemRole } from "@/lib/db/tenant";

/**
 * Is the data still being refreshed?
 *
 * /api/health answers "is the server up", which this app has needed since it
 * spent 92 days down without anyone noticing. But a server that is up while
 * its cron has quietly stopped is the same failure in better clothes: every
 * page still renders, every figure still has a number on it, and the number
 * is last week's. Nothing in the system would show that.
 *
 * So this reports the age of the things that are supposed to keep moving, and
 * returns 503 when any of them has stopped — which is what an uptime monitor
 * can actually alert on.
 */
export const dynamic = "force-dynamic";

/** The refresh cron runs daily; two days without a successful one is wrong. */
const REFRESH_MAX_AGE_HOURS = 48;
/** Snapshots run on weekdays, so a long weekend is normal and Tuesday is not. */
const SNAPSHOT_MAX_AGE_HOURS = 96;

export async function GET(request: Request) {
  return withSystemRole("staleness probe across every household", () => handleGet(request));
}

function hoursSince(at: Date | null | undefined): number | null {
  if (!at) return null;
  return Math.round(((Date.now() - at.getTime()) / 3_600_000) * 10) / 10;
}

async function handleGet(request: Request) {
  // Unauthenticated like /api/health, so it reports ages and counts only.
  // Never an institution name or an error string — those carry hostnames and
  // sometimes the name of someone's bank.
  void request;
  const db = getDb();

  try {
    const [lastRefresh] = await db
      .select()
      .from(cronRuns)
      .where(eq(cronRuns.job, "plaid_refresh"))
      .orderBy(desc(cronRuns.startedAt))
      .limit(1);

    const [lastSnapshot] = await db
      .select({ at: portfolioSnapshots.createdAt })
      .from(portfolioSnapshots)
      .orderBy(desc(portfolioSnapshots.createdAt))
      .limit(1);

    const [items] = await db
      .select({
        total: sql<number>`count(*)::int`,
        needingReconnect: sql<number>`count(*) filter (where ${plaidItems.status} = 'requires_reauth')::int`,
        failing: sql<number>`count(*) filter (where ${plaidItems.consecutiveFailures} > 0)::int`,
        oldestSyncHours: sql<number | null>`
          round(extract(epoch from (now() - min(${plaidItems.lastSync}))) / 3600)::int
        `,
      })
      .from(plaidItems)
      .where(inArray(plaidItems.status, ["active", "error"]));

    const refreshAgeHours = hoursSince(lastRefresh?.finishedAt ?? null);
    const snapshotAgeHours = hoursSince(lastSnapshot?.at ?? null);

    const checks = {
      // Null means it has never run, which is as wrong as having stopped.
      refreshRan: refreshAgeHours !== null && refreshAgeHours <= REFRESH_MAX_AGE_HOURS,
      snapshotRan: snapshotAgeHours !== null && snapshotAgeHours <= SNAPSHOT_MAX_AGE_HOURS,
      // A truncated run is not a failure, but a run that is always truncated
      // means the job can no longer finish inside its window.
      refreshCompleted: lastRefresh ? lastRefresh.truncated === false : false,
    };

    const fresh = Object.values(checks).every(Boolean);

    return Response.json(
      {
        status: fresh ? "fresh" : "stale",
        checks,
        refresh: {
          ageHours: refreshAgeHours,
          ok: lastRefresh?.ok ?? null,
          processed: lastRefresh?.processed ?? null,
          failed: lastRefresh?.failed ?? null,
          truncated: lastRefresh?.truncated ?? null,
        },
        snapshot: { ageHours: snapshotAgeHours },
        plaidItems: {
          total: items?.total ?? 0,
          failing: items?.failing ?? 0,
          needingReconnect: items?.needingReconnect ?? 0,
          oldestSyncHours: items?.oldestSyncHours ?? null,
        },
        checkedAt: new Date().toISOString(),
      },
      {
        status: fresh ? 200 : 503,
        headers: { "cache-control": "no-store" },
      }
    );
  } catch {
    // Deliberately no error text: this endpoint is public, and a database
    // error message carries the host it failed to reach.
    return Response.json(
      { status: "unknown", checkedAt: new Date().toISOString() },
      { status: 503, headers: { "cache-control": "no-store" } }
    );
  }
}
