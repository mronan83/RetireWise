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
  /**
   * Rows Plaid attached to a fee pseudo-security, stored as account-level
   * flows rather than as position rows. See isFeePseudoSecurity.
   */
  unlinkedFeeRows: number;
  /**
   * Rows already stored that this run gave a security id to. See
   * planSecurityBackfill: without it the rows stored before the column
   * existed would never get one, because a stored row is never revisited.
   */
  backfilledSecurityIds: number;
  earliest: string | null;
  latest: string | null;
};

const EMPTY: TransactionSyncCounts = {
  fetched: 0,
  inserted: 0,
  skippedDuplicate: 0,
  skippedUnmappedAccount: 0,
  unlinkedFeeRows: 0,
  backfilledSecurityIds: 0,
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

/** The fields of a Plaid security this module reads. */
export type PlaidSecurityLike = {
  ticker_symbol?: string | null;
  cusip?: string | null;
  name?: string | null;
};

/**
 * A pseudo-security that stands for a charge, not for something held.
 *
 * Plaid models an employer plan's fees as securities of their own, named
 * after the fund the charge was taken from: `VANG INST TOTL SK TR - fees`,
 * `WT CIF II GROWTH - fees`. They carry no ticker and no CUSIP because they
 * are not instruments, and no holding will ever report them — so a row
 * stored against one is a position row that can never match a position, and
 * the fund it names is already someone else's position.
 *
 * The flow is real and worth keeping (it comes out of the account's return),
 * so the row is stored; what it must not carry is a security identity that
 * makes it look like part of a position.
 */
export function isFeePseudoSecurity(
  security: PlaidSecurityLike | undefined
): boolean {
  if (!security) return false;
  if (security.ticker_symbol || security.cusip) return false;
  return /[\s\-\u2013\u2014]+fees?$/i.test((security.name ?? "").trim());
}

/** What a transaction's security means for matching it to a position. */
export type TransactionSecurity = {
  ticker: string | null;
  plaidSecurityId: string | null;
};

/**
 * Resolve the security a transaction moved.
 *
 * Two things are deliberate here.
 *
 * The id is kept even when the security itself is not in the map. Plaid
 * describes a security in the page that happens to mention it first, and a
 * page processed on its own can reference ids it does not describe — 97 of
 * one account's 727 rows came out with a null ticker for exactly that
 * reason. The id is on every row regardless, and the holdings side carries
 * the same id, so those rows still find their position.
 *
 * A fee pseudo-security yields no identity at all, so the row lands as an
 * account-level fee rather than as a position row that can never match.
 */
export function resolveTransactionSecurity(
  securityId: string | null,
  securities: Map<string, PlaidSecurityLike>
): TransactionSecurity {
  if (!securityId) return { ticker: null, plaidSecurityId: null };

  const security = securities.get(securityId);
  if (isFeePseudoSecurity(security)) {
    return { ticker: null, plaidSecurityId: null };
  }

  // The spelling rule aggregateHoldings uses — ticker, else CUSIP, else
  // name. It is no longer what positions are matched on, but it is still
  // what a person reads on the transactions page.
  const ticker = security
    ? security.ticker_symbol || security.cusip || security.name || null
    : null;

  return { ticker, plaidSecurityId: securityId };
}

/** A transaction row as already stored, for the backfill below. */
export type StoredTransaction = {
  plaidTransactionId: string | null;
  plaidSecurityId: string | null;
  ticker: string | null;
};

/** One stored row to be given the identity it was recorded without. */
export type SecurityBackfill = {
  plaidTransactionId: string;
  plaidSecurityId: string;
  /** A ticker to write where the row has none; null leaves it as stored. */
  ticker: string | null;
};

/**
 * Give already-stored rows the security id they were recorded without.
 *
 * This sync is idempotent by Plaid's transaction id, which it achieves by
 * never touching a row it has already stored. That is right for a flow —
 * the amount and date of a transaction that happened do not change — but it
 * means a column added later is never filled in for anything already there,
 * and the migration had nothing to backfill from.
 *
 * Without this, one Schwab 401(k)'s 727 stored rows keep a null security id
 * for good, the position match falls back to the ticker spelling that never
 * agreed, and the eight positions this change exists to fix stay broken
 * while every run reports "fetched 727, inserted 0".
 *
 * The full window is re-fetched on every run anyway, so the identity is
 * already in hand and being discarded. This is self-extinguishing: it plans
 * work only for rows that still have no id, so the first run after the
 * migration does all of it and later runs plan none.
 */
export function planSecurityBackfill(
  fetched: { plaidTransactionId: string; security: TransactionSecurity }[],
  stored: StoredTransaction[]
): SecurityBackfill[] {
  const byId = new Map(
    stored.filter((s) => s.plaidTransactionId).map((s) => [s.plaidTransactionId!, s])
  );

  const planned: SecurityBackfill[] = [];
  for (const f of fetched) {
    if (!f.security.plaidSecurityId) continue;
    const row = byId.get(f.plaidTransactionId);
    // Not stored yet (it is in this run's insert), or already identified.
    if (!row || row.plaidSecurityId) continue;

    planned.push({
      plaidTransactionId: f.plaidTransactionId,
      plaidSecurityId: f.security.plaidSecurityId,
      // A stored ticker is left alone: it is what the transactions page
      // shows, and the id is what the matching now uses. Only a row that
      // has none — its security went undescribed in the page it was
      // stored from — gets one.
      ticker: row.ticker === null ? f.security.ticker : null,
    });
  }

  return planned;
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
   * Every security described by any page, accumulated before a single row is
   * mapped.
   *
   * Plaid describes a security once, in whichever page first mentions it,
   * and the pages are not ordered by security. A row on page 1 can name an
   * id that only page 3 describes, so mapping each page as it arrives would
   * leave that row with no ticker for no reason other than fetch order.
   * Rows are built after the loop, against the whole map.
   */
  const securities = new Map<string, PlaidSecurityLike>();
  let offset = 0;
  for (let page = 0; page < MAX_PAGES; page++) {
    const { data } = await client.investmentsTransactionsGet({
      access_token: accessToken,
      start_date: startDate,
      end_date: endDate,
      options: { count: PAGE_SIZE, offset },
    });

    for (const sec of data.securities ?? []) {
      securities.set(sec.security_id, sec);
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
    .select({
      plaidTransactionId: transactions.plaidTransactionId,
      plaidSecurityId: transactions.plaidSecurityId,
      ticker: transactions.ticker,
    })
    .from(transactions)
    .where(inArray(transactions.plaidTransactionId, ids));
  const seen = new Set(existing.map((e) => e.plaidTransactionId));

  // Before the insert, because these rows are the ones the insert skips.
  const backfill = planSecurityBackfill(
    all.map((t) => ({
      plaidTransactionId: t.investment_transaction_id,
      security: resolveTransactionSecurity(t.security_id, securities),
    })),
    existing
  );
  for (const b of backfill) {
    await db
      .update(transactions)
      .set({
        plaidSecurityId: b.plaidSecurityId,
        ...(b.ticker === null ? {} : { ticker: b.ticker }),
      })
      .where(
        and(
          eq(transactions.plaidTransactionId, b.plaidTransactionId),
          isNull(transactions.plaidSecurityId)
        )
      );
  }
  counts.backfilledSecurityIds = backfill.length;

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

    const security = resolveTransactionSecurity(t.security_id, securities);
    if (t.security_id && security.plaidSecurityId === null) {
      // A fee pseudo-security: kept as a flow, stripped of the identity that
      // would file it under a position it can never belong to.
      counts.unlinkedFeeRows++;
    }

    rows.push({
      accountId,
      type,
      ticker: security.ticker,
      plaidSecurityId: security.plaidSecurityId,
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

/** Enough of a position to find its transactions. */
export type PositionIdentity = {
  id: string;
  accountId: string;
  ticker: string | null;
  plaidSecurityId: string | null;
};

/** Enough of a transaction to be found by one. */
export type TransactionIdentity = {
  accountId: string;
  ticker: string | null;
  plaidSecurityId: string | null;
};

/**
 * Group an account's transactions under the positions they belong to.
 *
 * The join used to be `accountId | ticker`, and the ticker on each side is a
 * string we derived from whatever Plaid returned in that endpoint —
 * `ticker_symbol || cusip || name`. Plaid does not return the same security
 * record in both endpoints, so for one Schwab 401(k) the two sides read:
 *
 *   holding `GG.EUPAC.TRUST.R1`   transaction `RERGX`
 *   holding `VG.IS.TL.INTL.STK.MK`  transaction `VTSNX`
 *   holding `PUTN.LARGE.CP.VAL.R1`  transaction `GEPABX`
 *
 * Eight of that account's thirteen positions matched zero of its 727
 * transactions, and every one of them was then reported as having "no
 * transactions in the window" — a window with two years of payroll
 * deferrals in it. The data was there; the key was wrong.
 *
 * So the key is Plaid's security id, which is opaque, meaningless and
 * stable within an Item, wherever both sides have one. Ticker is still used
 * where it is the only identity there is:
 *
 *  - rows a person typed in, which have no Plaid identity at all;
 *  - rows stored before the security id was recorded, which the migration
 *    could not backfill — they keep matching as they did until a sync
 *    rewrites them.
 *
 * A ticker match never overrides a security-id match, because Plaid saying
 * two rows are the same security is better evidence than two derived
 * strings being spelled alike.
 */
export function matchTransactionsToPositions<
  P extends PositionIdentity,
  T extends TransactionIdentity
>(positions: P[], txns: T[]): Map<string, T[]> {
  const bySecurity = new Map<string, T[]>();
  const byTicker = new Map<string, T[]>();
  const byTickerWithoutPlaidIdentity = new Map<string, T[]>();

  const push = (index: Map<string, T[]>, key: string, t: T) => {
    const list = index.get(key);
    if (list) list.push(t);
    else index.set(key, [t]);
  };

  for (const t of txns) {
    if (t.plaidSecurityId) {
      push(bySecurity, `${t.accountId}|${t.plaidSecurityId}`, t);
    }
    if (t.ticker) {
      push(byTicker, `${t.accountId}|${t.ticker}`, t);
      if (!t.plaidSecurityId) {
        push(byTickerWithoutPlaidIdentity, `${t.accountId}|${t.ticker}`, t);
      }
    }
  }

  const matched = new Map<string, T[]>();
  for (const p of positions) {
    const identified = p.plaidSecurityId
      ? bySecurity.get(`${p.accountId}|${p.plaidSecurityId}`) ?? []
      : [];
    // Hand-entered rows belong to the position whatever its Plaid identity
    // is: they are the same fund, recorded by the only other means there is.
    const manual = p.ticker
      ? byTickerWithoutPlaidIdentity.get(`${p.accountId}|${p.ticker}`) ?? []
      : [];

    let rows = [...identified, ...manual];

    // Nothing by identity, so fall back to the old key. This is what finds a
    // position's Plaid rows that were stored before the id column existed;
    // once a sync has rewritten them the branch above matches instead.
    if (rows.length === 0 && p.ticker) {
      rows = byTicker.get(`${p.accountId}|${p.ticker}`) ?? [];
    }

    matched.set(p.id, rows);
  }

  return matched;
}

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
      plaidSecurityId: holdings.plaidSecurityId,
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
      plaidSecurityId: transactions.plaidSecurityId,
      type: transactions.type,
      shares: transactions.shares,
      amount: transactions.amount,
      date: transactions.date,
    })
    .from(transactions)
    .where(inArray(transactions.accountId, accountIds));

  const byPosition = matchTransactionsToPositions(candidates, txns);

  for (const c of candidates) {
    result.attempted++;
    const rows = byPosition.get(c.id) ?? [];
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
        costBasisSource: "derived",
        costBasisUpdatedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(holdings.id, c.id));
    result.derived++;
  }

  return result;
}
