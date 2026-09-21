import { and, asc, eq, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/db";
import { cronRuns, plaidItems } from "@/lib/db/schema";
import { getPlaidClient } from "@/lib/plaid/client";
import { decryptToken } from "@/lib/plaid/encryption";
import { syncPlaidBalances, syncPlaidItem } from "@/lib/plaid/sync";
import {
  deriveMissingCostBasis,
  syncInvestmentTransactions,
} from "@/lib/plaid/investment-transactions";
import {
  DEAD_LETTER_AFTER,
  needsReconnect,
  nextAttemptAfter,
  plaidErrorCode,
} from "@/lib/plaid/backoff";
import { withSystemRole } from "@/lib/db/tenant";

/**
 * Vercel's ceiling for this function. The budget below stops well short of it,
 * because being killed mid-item loses the record of what was done.
 */
export const maxDuration = 300;

/** Stop starting new work after this, and let the next run continue. */
const TIME_BUDGET_MS = 230_000;

/**
 * How many items are refreshed at once.
 *
 * Small on purpose: these are third-party calls against one upstream, and the
 * point of concurrency here is to stop one slow institution from consuming the
 * whole budget, not to go as fast as possible.
 */
const CONCURRENCY = 3;

/** A ceiling on rows pulled into memory in one run. */
const MAX_ITEMS_PER_RUN = 300;

export async function GET(request: Request) {
  return withSystemRole("iterates every household's Plaid items", () => handleGet(request));
}

async function handleGet(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startedAtMs = Date.now();
  const db = getDb();
  const client = getPlaidClient();

  const [run] = await db
    .insert(cronRuns)
    .values({ job: "plaid_refresh" })
    .returning({ id: cronRuns.id });

  // Items due for an attempt, oldest sync first so nothing starves. An item in
  // "error" is still in the rotation — only requires_reauth is out, because
  // only that one genuinely needs a person.
  const due = await db
    .select()
    .from(plaidItems)
    .where(
      and(
        inArray(plaidItems.status, ["active", "error"]),
        or(isNull(plaidItems.nextAttemptAt), lte(plaidItems.nextAttemptAt, new Date()))
      )
    )
    .orderBy(sql`${plaidItems.lastSync} asc nulls first`, asc(plaidItems.createdAt))
    .limit(MAX_ITEMS_PER_RUN);

  let refreshed = 0;
  let failed = 0;
  let skipped = 0;
  let truncated = false;
  const deadLettered: string[] = [];

  async function refreshOne(item: (typeof due)[number]) {
    try {
      const accessToken = decryptToken(item.accessTokenEncrypted);
      const shared = {
        client,
        clerkId: item.clerkId,
        itemId: item.itemId,
        accessToken,
        institutionName: item.institutionName,
      };

      // Settled, not sequential: a bank item has no holdings endpoint, and
      // letting that throw would skip the balance sync and mark the item
      // errored, so the account would stop refreshing entirely.
      const results = await Promise.allSettled([
        syncPlaidItem(shared),
        syncPlaidBalances(shared),
        /**
         * Investment transactions, for the flows that make a return a
         * return.
         *
         * Alongside the others rather than after them, and settled rather
         * than awaited in sequence, because this endpoint is the weakest of
         * the three: employer-plan record-keepers support it unevenly, and
         * an institution that returns nothing here must not stop the
         * holdings and balances that were going to work.
         */
        syncInvestmentTransactions({
          client,
          clerkId: item.clerkId,
          accessToken,
        }),
      ]);
      const failures = results.filter((r) => r.status === "rejected");
      if (failures.length === results.length) {
        throw (failures[0] as PromiseRejectedResult).reason;
      }
      for (const f of failures) {
        console.warn(
          `Partial refresh for item ${item.id}:`,
          (f as PromiseRejectedResult).reason
        );
      }

      await db
        .update(plaidItems)
        .set({
          lastSync: new Date(),
          status: "active",
          consecutiveFailures: 0,
          lastError: null,
          lastErrorAt: null,
          nextAttemptAt: null,
          updatedAt: new Date(),
        })
        .where(eq(plaidItems.id, item.id));
      refreshed++;
    } catch (e) {
      const failures = item.consecutiveFailures + 1;
      const terminal = needsReconnect(e) || failures >= DEAD_LETTER_AFTER;
      const code = plaidErrorCode(e);
      const message = code ?? (e instanceof Error ? e.message : String(e));

      if (terminal) deadLettered.push(item.institutionName);

      await db
        .update(plaidItems)
        .set({
          status: terminal ? "requires_reauth" : "error",
          consecutiveFailures: failures,
          lastError: message.slice(0, 500),
          lastErrorAt: new Date(),
          // A terminal item is not retried; the user reconnects it instead.
          nextAttemptAt: terminal ? null : nextAttemptAfter(failures),
          updatedAt: new Date(),
        })
        .where(eq(plaidItems.id, item.id));

      console.error(
        `Refresh failed for item ${item.id} (${item.institutionName}), ` +
          `attempt ${failures}${terminal ? ", giving up" : ""}:`,
        e
      );
      failed++;
    }
  }

  // A fixed pool rather than Promise.all over everything: the whole point is
  // to bound how much is in flight, and to stop starting work once the budget
  // is spent so the run can record what it did.
  let cursor = 0;
  const workers = Array.from({ length: CONCURRENCY }, async () => {
    while (cursor < due.length) {
      if (Date.now() - startedAtMs > TIME_BUDGET_MS) {
        truncated = true;
        skipped = due.length - cursor;
        cursor = due.length;
        return;
      }
      const item = due[cursor++];
      await refreshOne(item);
    }
  });
  await Promise.all(workers);

  /**
   * Derive cost basis, once per household and only after its items are in.
   *
   * After the loop because a position's transactions can arrive from a
   * different Item than the one holding it, and per household because the
   * derivation reads across accounts. Only positions that still have no
   * basis are touched: one Plaid reported, or a person typed, is better
   * evidence than anything reconstructed here.
   *
   * Every failure carries its reason, and the reasons are recorded on the
   * run rather than swallowed — "could not derive" without saying why is
   * how a gap becomes permanent and unexplained.
   */
  const basisByHousehold: Record<string, { derived: number; attempted: number; reasons: string[] }> = {};
  for (const clerkId of new Set(due.map((i) => i.clerkId))) {
    try {
      const r = await deriveMissingCostBasis(clerkId);
      if (r.attempted > 0) {
        basisByHousehold[clerkId] = {
          derived: r.derived,
          attempted: r.attempted,
          reasons: [...new Set(r.skipped.map((s) => s.reason))].slice(0, 10),
        };
      }
    } catch (e) {
      console.error(`Cost basis derivation failed for ${clerkId}:`, e);
    }
  }

  await db
    .update(cronRuns)
    .set({
      finishedAt: new Date(),
      ok: failed === 0,
      processed: refreshed,
      failed,
      truncated,
      detail: { due: due.length, skipped, deadLettered, costBasis: basisByHousehold },
    })
    .where(eq(cronRuns.id, run.id));

  if (refreshed > 0) {
    revalidatePath("/dashboard");
    revalidatePath("/accounts");
    revalidatePath("/holdings");
    revalidatePath("/net-worth");
  }

  return Response.json({
    success: true,
    due: due.length,
    refreshed,
    failed,
    skipped,
    truncated,
    deadLettered,
    costBasis: basisByHousehold,
  });
}
