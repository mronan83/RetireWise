import { and, eq, inArray, isNull } from "drizzle-orm";
import type { PlaidApi } from "plaid";
import { getDb } from "@/lib/db";
import { accounts, holdings, transactions } from "@/lib/db/schema";

/**
 * Investment transactions, from the Items already linked.
 *
 * No re-link is needed and none should be done: Plaid returns history "up to
 * 2 years prior to the initial linking of the Item", so the window is
 * anchored to when the Item was created, not to when it is first queried.
 * Re-linking mints a NEW Item anchored to that day and throws the older
 * window away. The `investments` product these Items already carry covers
 * this endpoint; nothing about the connection changes.
 *
 * What this buys, precisely:
 *
 *  - Flows inside the period we hold daily values for, so a contribution
 *    stops counting as performance retroactively instead of decaying out of
 *    the figure over months.
 *  - Cost basis for positions whose entire life falls inside the window,
 *    which is checkable rather than assumed. See deriveCostBasis.
 *  - Dividends, fees and actual contribution amounts.
 *
 * What it does NOT buy, contrary to what I said before building it:
 * genuine 1Y or 2Y returns. A time-weighted return needs the account's
 * VALUE on both dates, and transactions carry flows, not valuations. The
 * value series still starts 2026-04-20. Reconstructing earlier values would
 * mean pricing every historical position, and the employer-plan collective
 * trusts have no public quote at any date.
 */

/** Plaid caps a page at 500; this is its documented maximum. */
const PAGE_SIZE = 500;

/** Stop paging no matter what, so a malformed response cannot spin. */
const MAX_PAGES = 40;

export type TransactionSyncCounts = {
  fetched: number;
  inserted: number;
  skippedDuplicate: number;
  skippedUnmappedAccount: number;
  earliest: string | null;
  latest: string | null;
};

const EMPTY: TransactionSyncCounts = {
  fetched: 0,
  inserted: 0,
  skippedDuplicate: 0,
  skippedUnmappedAccount: 0,
  earliest: null,
  latest: null,
};

type PlaidInvestmentTransaction = {
  investment_transaction_id: string;
  account_id: string;
  security_id: string | null;
  date: string;
  name: string;
  quantity: number;
  amount: number;
  price: number;
  fees: number | null;
  type: string;
  subtype: string;
};

/** Our transaction_type enum. */
export type LocalTransactionType =
  | "buy"
  | "sell"
  | "dividend"
  | "contribution"
  | "withdrawal"
  | "fee"
  | "transfer"
  | "split";

/**
 * Plaid's (type, subtype) pair to ours.
 *
 * Subtype carries the meaning that matters here — `cash` alone says money
 * moved without saying whether it was a dividend, a payroll contribution or
 * a withdrawal, and those are three different things to a retirement plan.
 * An unrecognised pair returns null and the row is skipped rather than
 * forced into the nearest category, because a mislabelled contribution is a
 * mislabelled flow and a wrong return follows from it.
 */
export function mapTransactionType(
  type: string,
  subtype: string
): LocalTransactionType | null {
  const t = type.toLowerCase();
  const s = subtype.toLowerCase();

  if (s === "split" || s === "stock distribution") return "split";
  if (s === "contribution" || s === "deposit") return "contribution";
  if (s.includes("dividend") || s.includes("capital gain") || s === "interest")
    return "dividend";
  if (s.includes("fee") || s === "non-resident tax" || s === "margin expense")
    return "fee";
  if (s === "withdrawal" || s === "distribution" || s === "send")
    return "withdrawal";

  if (t === "buy") return "buy";
  if (t === "sell") return "sell";
  if (t === "fee") return "fee";
  if (t === "transfer") return "transfer";
  // "cancel" reverses another row and "cash" with no telling subtype says
  // nothing we can act on.
  return null;
}

/**
 * Pull every investment transaction for an Item and record the new ones.
 *
 * Idempotent by Plaid's own transaction id: the unique index refuses a
 * second copy, so a re-run adds only what is genuinely new. Rows for Plaid
 * accounts this household has not mapped are counted and skipped rather
 * than attached to a guess.
 */
export async function syncInvestmentTransactions(options: {
  client: PlaidApi;
  clerkId: string;
  accessToken: string;
  /** How far back to ask. Defaults to the full two-year window. */
  startDate?: string;
  endDate?: string;
}): Promise<TransactionSyncCounts> {
  const { client, clerkId, accessToken } = options;
  const db = getDb();
  const counts: TransactionSyncCounts = { ...EMPTY };

  const endDate = options.endDate ?? new Date().toISOString().split("T")[0];
  const startDate =
    options.startDate ??
    (() => {
      const d = new Date();
      d.setFullYear(d.getFullYear() - 2);
      return d.toISOString().split("T")[0];
    })();

  // Plaid account id -> our account row, so a transaction lands on the
  // account the holdings sync already resolved.
  const owned = await db
    .select({ id: accounts.id, plaidAccountId: accounts.plaidAccountId })
    .from(accounts)
    .where(eq(accounts.clerkId, clerkId));
  const byPlaidId = new Map(
    owned.filter((a) => a.plaidAccountId).map((a) => [a.plaidAccountId!, a.id])
  );

  const all: PlaidInvestmentTransaction[] = [];
  /**
   * Security id to ticker, taken from the same response.
   *
   * Plaid's security ids are opaque and per-Item, so a transaction can only
   * be tied to a position through this. The spelling rule is the one
   * aggregateHoldings uses — ticker, else CUSIP, else name — because a
   * transaction whose ticker is spelled differently from the holding's
   * would never match it, which is the mismatch that deleted a whole
   * account's hand-entered rows yesterday.
   */
  const tickerBySecurity = new Map<string, string>();
  let offset = 0;
  for (let page = 0; page < MAX_PAGES; page++) {
    const { data } = await client.investmentsTransactionsGet({
      access_token: accessToken,
      start_date: startDate,
      end_date: endDate,
      options: { count: PAGE_SIZE, offset },
    });

    for (const sec of data.securities ?? []) {
      const ticker = sec.ticker_symbol || sec.cusip || sec.name;
      if (ticker) tickerBySecurity.set(sec.security_id, ticker);
    }

    const batch = (data.investment_transactions ??
      []) as unknown as PlaidInvestmentTransaction[];
    all.push(...batch);
    offset += batch.length;

    if (batch.length === 0 || offset >= (data.total_investment_transactions ?? 0)) {
      break;
    }
  }

  counts.fetched = all.length;
  if (all.length === 0) return counts;

  const dates = all.map((t) => t.date).sort();
  counts.earliest = dates[0];
  counts.latest = dates[dates.length - 1];

  // Which ids are already stored, so the insert only carries new ones.
  const ids = all.map((t) => t.investment_transaction_id);
  const existing = await db
    .select({ plaidTransactionId: transactions.plaidTransactionId })
    .from(transactions)
    .where(inArray(transactions.plaidTransactionId, ids));
  const seen = new Set(existing.map((e) => e.plaidTransactionId));

  const rows: (typeof transactions.$inferInsert)[] = [];
  for (const t of all) {
    if (seen.has(t.investment_transaction_id)) {
      counts.skippedDuplicate++;
      continue;
    }
    const accountId = byPlaidId.get(t.account_id);
    if (!accountId) {
      counts.skippedUnmappedAccount++;
      continue;
    }
    const type = mapTransactionType(t.type, t.subtype);
    if (type === null) continue;

    rows.push({
      accountId,
      type,
      ticker: t.security_id ? tickerBySecurity.get(t.security_id) ?? null : null,
      shares: t.quantity === 0 ? null : String(t.quantity),
      pricePerShare: t.price === 0 ? null : String(t.price),
      amount: String(t.amount),
      date: t.date,
      description: t.name,
      dataSource: "plaid",
      plaidTransactionId: t.investment_transaction_id,
    });
  }

  if (rows.length > 0) {
    // onConflictDoNothing rather than a pre-check alone: two runs overlapping
    // would otherwise both pass the check and both insert.
    await db.insert(transactions).values(rows).onConflictDoNothing();
    counts.inserted = rows.length;
  }

  return counts;
}

export type DerivedBasis =
  | { ok: true; costBasisPerShare: number; totalCost: number; shares: number; acquisitions: number }
  | { ok: false; reason: string };

/**
 * Cost basis for a position, derived only when the record proves it can be.
 *
 * Two conditions, both checkable, and both required:
 *
 *  1. Every share currently held was acquired inside the window. Tested by
 *     reconciling share counts, not assumed from the dates: if acquisitions
 *     minus disposals does not equal what is held today, some of it was
 *     bought before Plaid's two years or transferred in, and the cost of
 *     those shares is not in the data.
 *  2. Nothing was disposed of. With a sale in the history the answer depends
 *     on which lots the broker sold — FIFO, average cost, specific
 *     identification — and Plaid does not say. Picking one would produce a
 *     number that looks authoritative and disagrees with the 1099-B.
 *
 * Anything else returns a reason rather than an estimate. The whole point of
 * the exercise is that a wrong basis is worse than a blank one: blank
 * prompts a question, wrong gets believed.
 */
export function deriveCostBasis(
  txns: { type: LocalTransactionType; shares: number | null; amount: number; date: string }[],
  currentShares: number,
  tolerance = 1e-4
): DerivedBasis {
  if (txns.length === 0) return { ok: false, reason: "no transactions in the window" };

  const sorted = [...txns].sort((a, b) => a.date.localeCompare(b.date));

  const disposal = sorted.find((t) => t.type === "sell" || t.type === "withdrawal");
  if (disposal) {
    return {
      ok: false,
      reason: `a disposal on ${disposal.date} makes the remaining lots depend on the broker's method`,
    };
  }
  const transfer = sorted.find((t) => t.type === "transfer");
  if (transfer) {
    return {
      ok: false,
      reason: `a transfer on ${transfer.date} carries a basis set before this window`,
    };
  }
  if (sorted.some((t) => t.type === "split")) {
    return { ok: false, reason: "a split rebases the per-share cost" };
  }

  // Acquisitions: purchases and anything reinvested, each its own lot.
  const acquisitions = sorted.filter(
    (t) => (t.type === "buy" || t.type === "dividend" || t.type === "contribution") && t.shares !== null && t.shares > 0
  );
  if (acquisitions.length === 0) {
    return { ok: false, reason: "no share-acquiring transactions in the window" };
  }

  const acquiredShares = acquisitions.reduce((s, t) => s + (t.shares ?? 0), 0);
  if (Math.abs(acquiredShares - currentShares) > Math.max(tolerance, currentShares * 1e-6)) {
    return {
      ok: false,
      reason: `acquired ${acquiredShares.toFixed(4)} shares but ${currentShares.toFixed(4)} are held, so some predate the window`,
    };
  }

  // Plaid signs money leaving the account as positive on a buy, so the
  // magnitude is the cost either way.
  const totalCost = acquisitions.reduce((s, t) => s + Math.abs(t.amount), 0);
  if (!(totalCost > 0)) {
    return { ok: false, reason: "acquisitions carry no cost amount" };
  }

  return {
    ok: true,
    costBasisPerShare: totalCost / acquiredShares,
    totalCost,
    shares: acquiredShares,
    acquisitions: acquisitions.length,
  };
}

export type BasisDerivationResult = {
  attempted: number;
  derived: number;
  /** Why each position that failed could not be derived, for the log. */
  skipped: { ticker: string; reason: string }[];
};

/**
 * Fill in cost basis for positions the transaction record can prove.
 *
 * Only positions that currently have none are touched: a basis Plaid
 * reported, or a person typed, is better evidence than anything derived
 * here and is never overwritten.
 */
export async function deriveMissingCostBasis(
  clerkId: string
): Promise<BasisDerivationResult> {
  const db = getDb();
  const result: BasisDerivationResult = { attempted: 0, derived: 0, skipped: [] };

  const candidates = await db
    .select({
      id: holdings.id,
      accountId: holdings.accountId,
      ticker: holdings.ticker,
      shares: holdings.shares,
    })
    .from(holdings)
    .innerJoin(accounts, eq(accounts.id, holdings.accountId))
    .where(and(eq(accounts.clerkId, clerkId), isNull(holdings.costBasisPerShare)));

  if (candidates.length === 0) return result;

  const accountIds = [...new Set(candidates.map((c) => c.accountId))];
  const txns = await db
    .select({
      accountId: transactions.accountId,
      ticker: transactions.ticker,
      type: transactions.type,
      shares: transactions.shares,
      amount: transactions.amount,
      date: transactions.date,
    })
    .from(transactions)
    .where(inArray(transactions.accountId, accountIds));

  const byPosition = new Map<string, typeof txns>();
  for (const t of txns) {
    if (!t.ticker) continue;
    const key = `${t.accountId}|${t.ticker}`;
    const list = byPosition.get(key) ?? [];
    list.push(t);
    byPosition.set(key, list);
  }

  for (const c of candidates) {
    result.attempted++;
    const rows = byPosition.get(`${c.accountId}|${c.ticker}`) ?? [];
    const derived = deriveCostBasis(
      rows.map((r) => ({
        type: r.type as LocalTransactionType,
        shares: r.shares === null ? null : Number(r.shares),
        amount: Number(r.amount),
        date: r.date,
      })),
      Number(c.shares)
    );

    if (!derived.ok) {
      result.skipped.push({ ticker: c.ticker, reason: derived.reason });
      continue;
    }

    await db
      .update(holdings)
      .set({
        costBasisPerShare: String(derived.costBasisPerShare),
        updatedAt: new Date(),
      })
      .where(eq(holdings.id, c.id));
    result.derived++;
  }

  return result;
}
