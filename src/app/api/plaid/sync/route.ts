import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getApiUserId } from "@/lib/auth-helpers";
import { getDb } from "@/lib/db";
import { plaidItems } from "@/lib/db/schema";
import { withSystemRole } from "@/lib/db/tenant";
import { getPlaidClient } from "@/lib/plaid/client";
import { decryptToken } from "@/lib/plaid/encryption";
import { syncPlaidBalances, syncPlaidItem } from "@/lib/plaid/sync";
import {
  deriveMissingCostBasis,
  syncInvestmentTransactions,
} from "@/lib/plaid/investment-transactions";

/**
 * Sync this household's linked accounts on demand.
 *
 * The nightly cron does the same work for everyone; this does it for one
 * household, now, because waiting until 10:00 UTC to find out whether an
 * institution returns transactions at all is a poor way to learn it. It is
 * also the only way to run a sync without the cron secret, which belongs to
 * the platform rather than to anyone holding a session.
 *
 * Scoped to the caller's own items and nothing else. The cron iterates every
 * household and runs with the owner's role; this one resolves the household
 * from the session first and only then escalates, for the same reason the
 * webhooks do: an access token has no tenant of its own until a row says so.
 */
export const maxDuration = 120;

/**
 * How recently an item may have synced and still be refused.
 *
 * Plaid rate-limits per Item, and a button that can be held down is a way to
 * spend that allowance on nothing. Two minutes is long enough to stop a
 * double-click storm and short enough to be invisible to a person who
 * actually wants fresh data.
 */
const COOLDOWN_MS = 2 * 60 * 1000;

export async function POST() {
  const clerkId = await getApiUserId();
  if (!clerkId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  return withSystemRole(
    "reads this household's encrypted Plaid tokens, resolved from the session first",
    () => run(clerkId)
  );
}

async function run(clerkId: string) {
  const db = getDb();
  const client = getPlaidClient();

  const items = await db
    .select()
    .from(plaidItems)
    .where(
      and(
        eq(plaidItems.clerkId, clerkId),
        inArray(plaidItems.status, ["active", "error"])
      )
    );

  if (items.length === 0) {
    return Response.json({
      success: true,
      items: 0,
      message: "No linked institutions to sync.",
    });
  }

  const cutoff = new Date(Date.now() - COOLDOWN_MS);
  const results: {
    institution: string;
    status: "synced" | "cooling_down" | "failed";
    transactions?: { fetched: number; inserted: number; earliest: string | null; latest: string | null };
    error?: string;
  }[] = [];

  for (const item of items) {
    if (item.lastSync && item.lastSync > cutoff) {
      results.push({ institution: item.institutionName, status: "cooling_down" });
      continue;
    }

    try {
      const accessToken = decryptToken(item.accessTokenEncrypted);
      const shared = {
        client,
        clerkId: item.clerkId,
        itemId: item.id,
        accessToken,
        institutionName: item.institutionName,
      };

      // Settled, not sequential: investments/transactions is the weakest of
      // the three and an institution returning nothing there must not stop
      // the holdings and balances that were going to work.
      const [, , txns] = await Promise.allSettled([
        syncPlaidItem(shared),
        syncPlaidBalances(shared),
        syncInvestmentTransactions({ client, clerkId: item.clerkId, accessToken }),
      ]);

      await db
        .update(plaidItems)
        .set({ lastSync: new Date(), updatedAt: new Date() })
        .where(eq(plaidItems.id, item.id));

      results.push({
        institution: item.institutionName,
        status: "synced",
        transactions:
          txns.status === "fulfilled"
            ? {
                fetched: txns.value.fetched,
                inserted: txns.value.inserted,
                earliest: txns.value.earliest,
                latest: txns.value.latest,
              }
            : undefined,
        error:
          txns.status === "rejected"
            ? `transactions: ${String((txns as PromiseRejectedResult).reason).slice(0, 200)}`
            : undefined,
      });
    } catch (e) {
      results.push({
        institution: item.institutionName,
        status: "failed",
        error: (e instanceof Error ? e.message : String(e)).slice(0, 200),
      });
    }
  }

  /**
   * Derivation runs once, after every item, because a position's
   * transactions can arrive from a different Item than the one holding it.
   * Each refusal carries its reason so the caller can see exactly why a
   * basis is still missing rather than being told only that it is.
   */
  const basis = await deriveMissingCostBasis(clerkId);

  revalidatePath("/dashboard");
  revalidatePath("/accounts");
  revalidatePath("/holdings");
  revalidatePath("/transactions");

  return Response.json({
    success: true,
    items: items.length,
    results,
    costBasis: {
      attempted: basis.attempted,
      derived: basis.derived,
      stillMissing: basis.attempted - basis.derived,
      reasons: basis.skipped,
    },
  });
}

/** How stale each institution is, so the button can say what it will do. */
export async function GET() {
  const clerkId = await getApiUserId();
  if (!clerkId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  return withSystemRole("reads this household's item status", async () => {
    const items = await getDb()
      .select({
        institution: plaidItems.institutionName,
        status: plaidItems.status,
        lastSync: plaidItems.lastSync,
      })
      .from(plaidItems)
      .where(eq(plaidItems.clerkId, clerkId));
    return Response.json({ items });
  });
}

