import { and, eq, isNull } from "drizzle-orm";
import type { PlaidApi } from "plaid";
import { recordAudit } from "@/lib/audit";
import { getDb } from "@/lib/db";
import { accounts, cashReserves, debts, holdings } from "@/lib/db/schema";
import { closeOn, resolvePriceUpdate } from "@/lib/utils/market-session";

type Db = ReturnType<typeof getDb>;

export type SyncCounts = {
  accountsRelinked: number;
  accountsAdopted: number;
  accountsCreated: number;
  holdingsUpdated: number;
  holdingsAdded: number;
  holdingsRemoved: number;
};

const EMPTY: SyncCounts = {
  accountsRelinked: 0,
  accountsAdopted: 0,
  accountsCreated: 0,
  holdingsUpdated: 0,
  holdingsAdded: 0,
  holdingsRemoved: 0,
};

/**
 * Compare institution and account names the way a person would: ignoring case,
 * punctuation and spacing, so "MATT'S ROTH IRA" and "Matts Roth IRA" are one
 * account rather than two.
 */
export function normalizeName(value: string | null | undefined): string {
  return (value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Pull one Plaid item's investment accounts and holdings into the household.
 *
 * Linking is idempotent by construction. Every account is resolved to an
 * existing row before anything is inserted, and holdings are reconciled
 * against what is already stored rather than appended, so re-linking the same
 * institution updates the household instead of doubling it. This is shared by
 * the link handler and the nightly cron precisely because the two drifting
 * apart is what produced duplicates in the first place.
 */
export async function syncPlaidItem(options: {
  client: PlaidApi;
  clerkId: string;
  itemId: string;
  accessToken: string;
  institutionName: string;
}): Promise<SyncCounts> {
  const { client, clerkId, itemId, accessToken, institutionName } = options;
  const db = getDb();

  const response = await client.investmentsHoldingsGet({
    access_token: accessToken,
  });

  const securities = new Map(
    response.data.securities.map((s) => [s.security_id, s])
  );
  const counts: SyncCounts = { ...EMPTY };

  // Manual accounts this household owns, as adoption candidates. Read once:
  // an account adopted in this loop must not be offered to the next one.
  const unlinked = await db
    .select()
    .from(accounts)
    .where(and(eq(accounts.clerkId, clerkId), isNull(accounts.plaidAccountId)));
  const available = new Map(unlinked.map((a) => [a.id, a]));

  for (const pa of response.data.accounts) {
    const accountType = mapPlaidAccountType(pa.subtype || pa.type);
    const plaidName = pa.name || pa.official_name || "Plaid Account";

    const accountId = await resolveAccount({
      db,
      clerkId,
      itemId,
      institutionName,
      plaidAccountId: pa.account_id,
      plaidName,
      accountType,
      available,
      counts,
    });

    const incoming = aggregateHoldings(
      response.data.holdings.filter((h) => h.account_id === pa.account_id),
      securities
    );

    const reconciled = await reconcileHoldings(db, accountId, incoming, clerkId);
    counts.holdingsUpdated += reconciled.updated;
    counts.holdingsAdded += reconciled.added;
    counts.holdingsRemoved += reconciled.removed;
  }

  return counts;
}

/**
 * Find the row this Plaid account already corresponds to, or create one.
 *
 * Three cases, strongest evidence first: the same Plaid account id (a re-link),
 * the same institution and name as an account entered by hand (the user
 * already tracked it manually), or nothing recognisable (genuinely new).
 * A weaker guess than an exact name match is deliberately not made here —
 * silently folding "Tricia's Roth" into Matt's would misstate the portfolio
 * just as badly as a duplicate. Those are surfaced for confirmation instead.
 */
async function resolveAccount(args: {
  db: Db;
  clerkId: string;
  itemId: string;
  institutionName: string;
  plaidAccountId: string;
  plaidName: string;
  accountType: ReturnType<typeof mapPlaidAccountType>;
  available: Map<string, typeof accounts.$inferSelect>;
  counts: SyncCounts;
}): Promise<string> {
  const {
    db,
    clerkId,
    itemId,
    institutionName,
    plaidAccountId,
    plaidName,
    accountType,
    available,
    counts,
  } = args;

  const [existing] = await db
    .select({ id: accounts.id })
    .from(accounts)
    .where(
      and(
        eq(accounts.clerkId, clerkId),
        eq(accounts.plaidAccountId, plaidAccountId)
      )
    )
    .limit(1);

  if (existing) {
    await db
      .update(accounts)
      .set({
        institution: institutionName,
        plaidItemId: itemId,
        dataSource: "plaid",
        updatedAt: new Date(),
      })
      .where(eq(accounts.id, existing.id));
    counts.accountsRelinked++;
    return existing.id;
  }

  const wantedName = normalizeName(plaidName);
  const wantedInstitution = normalizeName(institutionName);
  const adoptable = [...available.values()].find(
    (a) =>
      normalizeName(a.name) === wantedName &&
      normalizeName(a.institution) === wantedInstitution
  );

  if (adoptable) {
    available.delete(adoptable.id);
    await db
      .update(accounts)
      .set({
        plaidItemId: itemId,
        plaidAccountId,
        dataSource: "plaid",
        updatedAt: new Date(),
      })
      .where(eq(accounts.id, adoptable.id));
    counts.accountsAdopted++;
    return adoptable.id;
  }

  const [created] = await db
    .insert(accounts)
    .values({
      clerkId,
      name: plaidName,
      institution: institutionName,
      accountType,
      taxTreatment: inferTaxTreatment(accountType),
      plaidItemId: itemId,
      plaidAccountId,
      dataSource: "plaid",
    })
    .returning({ id: accounts.id });

  counts.accountsCreated++;
  return created.id;
}

type IncomingHolding = {
  ticker: string;
  /**
   * Plaid's id for the security, carried through so the transactions sync
   * can find this position without agreeing on how the ticker is spelled.
   * Null only for a position Plaid described with no security at all.
   */
  plaidSecurityId: string | null;
  name: string;
  assetClass: ReturnType<typeof mapPlaidSecurityType>;
  shares: number;
  /** null when Plaid did not report cost basis. Never a stand-in figure. */
  costBasisPerShare: number | null;
  currentPrice: number;
  /** When the institution's price was struck: see plaidPriceTime. */
  priceAsOf: Date;
};

/**
 * When an institution's price was struck.
 *
 * It was stamped with the time of the sync, so a price days old read as
 * current. Plaid gives the price's date (`institution_price_as_of`) and, for
 * some institutions, a date and time (`institution_price_datetime`), which
 * may carry a placeholder midnight. In order:
 *
 *  1. the date and time, when it has a real time;
 *  2. the date, as that day's 4 pm close in New York;
 *  3. the sync's own time, when the institution gave neither.
 *
 * Never later than the sync: a close dated today, synced before 4 pm, is
 * dated now.
 */
export function plaidPriceTime(
  h: { institution_price_as_of?: string | null; institution_price_datetime?: string | null },
  syncedAt: Date
): Date {
  const datetime = h.institution_price_datetime ? new Date(h.institution_price_datetime) : null;
  const realTime =
    datetime && !Number.isNaN(datetime.getTime()) && datetime.toISOString().slice(11, 19) !== "00:00:00";
  const date = h.institution_price_as_of?.match(/^\d{4}-\d{2}-\d{2}/)?.[0] ??
    (datetime && !Number.isNaN(datetime.getTime()) ? datetime.toISOString().slice(0, 10) : null);
  const at = realTime ? datetime! : date ? closeOn(date) : syncedAt;
  return at.getTime() > syncedAt.getTime() ? syncedAt : at;
}

/**
 * Collapse Plaid's per-lot rows into one position per ticker.
 *
 * A position held in several lots comes back as several holdings. Inserting
 * each one would show the same fund two or three times, so shares are summed
 * and cost basis is averaged across them.
 */
export function aggregateHoldings(
  plaidHoldings: {
    security_id: string;
    quantity: number;
    institution_price?: number | null;
    institution_price_as_of?: string | null;
    institution_price_datetime?: string | null;
    cost_basis?: number | null;
  }[],
  securities: Map<string, { ticker_symbol?: string | null; cusip?: string | null; name?: string | null; type?: string | null }>,
  syncedAt: Date = new Date()
): IncomingHolding[] {
  const byTicker = new Map<string, IncomingHolding & { totalCost: number | null }>();

  for (const ph of plaidHoldings) {
    const security = securities.get(ph.security_id);
    if (!security) continue;

    const ticker =
      security.ticker_symbol || security.cusip || security.name || "UNKNOWN";
    const shares = ph.quantity ?? 0;
    const currentPrice = ph.institution_price ?? 0;
    const priceAsOf = plaidPriceTime(ph, syncedAt);

    /**
     * No stand-in when Plaid does not report cost basis.
     *
     * This was `ph.cost_basis ?? shares * currentPrice`, which makes cost
     * equal to market value — so the position shows exactly zero gain, and
     * the zero is stored as though the institution had said so. Plaid omits
     * cost basis for most employer plans, so every 401(k) position in the
     * app read "+$0.00 (+0.00%)" while actually being up thousands.
     */
    const totalCost = ph.cost_basis ?? null;

    const existing = byTicker.get(ticker);
    if (existing) {
      existing.shares += shares;
      // One lot without a basis makes the position's basis unknown: adding
      // the lots that do have one gives a cost lower than the truth, and a
      // gain correspondingly higher.
      existing.totalCost =
        existing.totalCost === null || totalCost === null
          ? null
          : existing.totalCost + totalCost;
      if (currentPrice) {
        existing.currentPrice = currentPrice;
        existing.priceAsOf = priceAsOf;
      }
    } else {
      byTicker.set(ticker, {
        ticker,
        plaidSecurityId: ph.security_id,
        name: security.name || ticker,
        assetClass: mapPlaidSecurityType(security.type ?? null),
        shares,
        costBasisPerShare: null,
        currentPrice,
        priceAsOf,
        totalCost,
      });
    }
  }

  return [...byTicker.values()].map((h) => ({
    ticker: h.ticker,
    plaidSecurityId: h.plaidSecurityId,
    name: h.name,
    assetClass: h.assetClass,
    shares: h.shares,
    costBasisPerShare:
      h.totalCost === null || !(h.shares > 0) ? null : h.totalCost / h.shares,
    currentPrice: h.currentPrice,
    priceAsOf: h.priceAsOf,
  }));
}

export type BasisUpdate =
  | Record<string, never>
  | { costBasisPerShare: string; costBasisSource: "plaid"; costBasisUpdatedAt: Date }
  | { costBasisPerShare: null; costBasisSource: null };

/**
 * What a sync may write to a position's cost basis. Three rules, in order.
 *
 *  1. A basis a person typed is never replaced. They read it off a statement
 *     for a position the institution had declined to report, which is better
 *     evidence than the institution later changing its mind — and replacing
 *     it silently is exactly the failure that cost this household two
 *     accounts' worth of recorded gain.
 *  2. A basis Plaid reports is written, with its provenance, over anything
 *     that is not manual.
 *  3. Plaid reporting nothing leaves an existing basis alone and gives a new
 *     position none. `shares * currentPrice` used to stand in here, which
 *     made cost equal value and every employer-plan position read as having
 *     never moved.
 */
export function resolveBasisUpdate(
  incoming: number | null,
  existing: { costBasisSource: string | null } | null
): BasisUpdate {
  if (existing?.costBasisSource === "manual") return {};
  if (incoming !== null) {
    return {
      costBasisPerShare: String(incoming),
      costBasisSource: "plaid",
      costBasisUpdatedAt: new Date(),
    };
  }
  return existing ? {} : { costBasisPerShare: null, costBasisSource: null };
}

/**
 * Make the account's holdings match what Plaid reports: update what is held,
 * add what is new, drop what was sold. Plaid is authoritative for an account
 * it feeds, so a ticker it no longer reports is a closed position, not a row
 * to keep alongside the live ones.
 */
async function reconcileHoldings(
  db: Db,
  accountId: string,
  incoming: IncomingHolding[],
  clerkId: string
) {
  const existing = await db
    .select()
    .from(holdings)
    .where(eq(holdings.accountId, accountId));

  const existingByTicker = new Map(existing.map((h) => [h.ticker, h]));
  const existingBySecurity = new Map(
    existing.filter((h) => h.plaidSecurityId).map((h) => [h.plaidSecurityId!, h])
  );
  const incomingTickers = new Set(incoming.map((h) => h.ticker));
  /** Rows this pass claimed, so the prune below drops only what Plaid dropped. */
  const matchedIds = new Set<string>();

  let updated = 0;
  let added = 0;
  let removed = 0;

  for (const h of incoming) {
    /**
     * Security id first, ticker second.
     *
     * Plaid re-spells an employer plan's funds between responses and between
     * releases. Matching only on the spelling means a re-spelled position is
     * not recognised as the one already stored: it is inserted as new and the
     * old row is pruned as a closed position, taking a hand-entered cost
     * basis with it. The id does not move, so it is the stronger evidence and
     * is tried first; ticker still catches rows stored before the id existed.
     */
    const byId = h.plaidSecurityId
      ? existingBySecurity.get(h.plaidSecurityId)
      : undefined;
    const candidate = byId ?? existingByTicker.get(h.ticker);
    // Two incoming positions resolving to one stored row would update it
    // twice and lose one of them; the second is inserted instead.
    const match = candidate && !matchedIds.has(candidate.id) ? candidate : undefined;
    if (match) matchedIds.add(match.id);

    /**
     * A sync that learns nothing about cost basis must not unlearn what is
     * already known.
     *
     * Plaid's coverage is not stable: the same position can come back with
     * cost basis one day and without it the next. This wrote whatever the
     * latest response held, so a single silent response permanently replaced
     * a real basis — recorded by an earlier sync, and by then the only copy
     * — with a fabricated one. Three accounts here lost their true basis
     * that way, together with several years of recorded gain.
     *
     * So an absent basis leaves the stored one alone. A basis the user typed
     * in by hand survives for the same reason: Plaid never reported it, and
     * Plaid saying nothing is not Plaid disagreeing.
     */
    const basis = resolveBasisUpdate(h.costBasisPerShare, match ?? null);

    /**
     * The price, dated by the institution rather than by this sync, and kept
     * out when a later one is already stored: the morning sync reports the
     * day before's close, and Refresh Prices may already have today's.
     * Shares are the institution's either way, and the value follows them
     * at whichever price stands.
     */
    const price = resolvePriceUpdate(
      { price: h.currentPrice, at: h.priceAsOf },
      match
        ? {
            price: Number(match.currentPrice),
            at: match.lastPriceUpdate,
            previousClose: match.previousClose === null ? null : Number(match.previousClose),
          }
        : null
    );
    // Null only when a match holds a later price, which then stands.
    const stands = price ?? {
      price: Number(match!.currentPrice),
      at: match!.lastPriceUpdate,
      previousClose: match!.previousClose === null ? null : Number(match!.previousClose),
    };

    const values = {
      name: h.name,
      plaidSecurityId: h.plaidSecurityId,
      assetClass: h.assetClass,
      shares: String(h.shares),
      currentPrice: String(stands.price),
      currentValue: String(h.shares * stands.price),
      previousClose: stands.previousClose === null ? null : String(stands.previousClose),
      dataSource: "plaid" as const,
      lastPriceUpdate: stands.at,
      ...basis,
    };

    if (match) {
      await db
        .update(holdings)
        .set({ ...values, updatedAt: new Date() })
        .where(eq(holdings.id, match.id));
      updated++;
    } else {
      await db.insert(holdings).values({ accountId, ticker: h.ticker, ...values });
      added++;
    }
  }

  // Only prune when Plaid actually returned positions. An empty response is
  // far more often a permissions or timing problem than a liquidated account,
  // and emptying the account on that signal loses data the user typed in.
  if (incoming.length > 0) {
    // Unmatched, and Plaid is not reporting that ticker either.
    //
    // Unmatched alone is not enough: a row could be unmatched because it is a
    // second copy of a ticker some earlier bug stored twice, and pruning on
    // this pass would delete it with no way back. What this has to catch is
    // the position Plaid genuinely stopped reporting — so a position Plaid
    // kept but re-spelled, matched by security id above, is no longer deleted
    // for having a ticker the response no longer contains.
    const doomed = existing.filter(
      (h) => !matchedIds.has(h.id) && !incomingTickers.has(h.ticker)
    );

    /**
     * Write down what is about to be deleted, before deleting it.
     *
     * A position with no security id — one a person typed by hand — is still
     * matched to Plaid by ticker, and Plaid spells an employer plan's funds
     * in its own way: `VG.IS.TL.INTL.STK.MK`, `PUTN.LARGE.CP.VAL.R1`,
     * `NYL.ANCHOR.ACCOUNT`. When a manual account is adopted, the rows a
     * person typed match none of those, so they are not updated in place:
     * they are deleted and replaced by Plaid's.
     * Everything hand-entered on them goes with them, cost basis first, and
     * the only trace left is that the account's gain silently changed.
     *
     * That happened to a Slalom 401(k) here: thirteen positions entered in
     * April, carrying a real basis of $56,213.97, deleted on the first sync
     * after linking. Nothing recorded them, so nothing could give them back.
     *
     * The deletion itself is still right — Plaid is authoritative for an
     * account it feeds, and keeping both copies would double the account's
     * value. What was wrong was doing it irreversibly. The row now lands in
     * the audit log with every field intact, so a mistaken prune is a query
     * away from being undone.
     */
    if (doomed.length > 0) {
      await recordAudit({
        clerkId,
        action: "holdings.replaced_by_sync",
        entity: "account",
        entityId: accountId,
        detail: {
          reason: "Plaid did not report these tickers; replaced by its own",
          removed: doomed.map((h) => ({
            ticker: h.ticker,
            name: h.name,
            shares: h.shares,
            costBasisPerShare: h.costBasisPerShare,
            currentPrice: h.currentPrice,
            currentValue: h.currentValue,
            dataSource: h.dataSource,
            createdAt: h.createdAt,
          })),
          incomingTickers: [...incomingTickers],
        },
      });
    }

    for (const holding of doomed) {
      await db.delete(holdings).where(eq(holdings.id, holding.id));
      removed++;
    }
  }

  return { updated, added, removed };
}

export function mapPlaidAccountType(
  subtype: string | null
): "401k" | "ira_traditional" | "ira_roth" | "brokerage" | "hsa" | "other" {
  switch (subtype) {
    case "401k":
    case "401a":
    case "403B":
    case "403b":
      return "401k";
    case "ira":
    case "sep ira":
    case "simple ira":
    case "rollover":
      return "ira_traditional";
    case "roth":
    case "roth ira":
    case "roth 401k":
      return "ira_roth";
    case "hsa":
      return "hsa";
    case "brokerage":
    case "individual":
    case "joint":
      return "brokerage";
    default:
      return "brokerage";
  }
}

export function inferTaxTreatment(
  accountType: string
): "tax_deferred" | "tax_free" | "taxable" {
  switch (accountType) {
    case "401k":
    case "403b":
    case "ira_traditional":
    case "pension":
      return "tax_deferred";
    case "ira_roth":
    case "hsa":
      return "tax_free";
    default:
      return "taxable";
  }
}

export function mapPlaidSecurityType(
  type: string | null
): "us_stock" | "bond" | "cash" | "other" {
  switch (type) {
    case "equity":
    case "etf":
    case "mutual fund":
      return "us_stock";
    case "fixed income":
      return "bond";
    case "cash":
      return "cash";
    default:
      return "other";
  }
}

/* ------------------------------------------------------------------------ *
 * Balances and loans
 *
 * Investments are positions; a savings account and a mortgage are a single
 * number each. They live in different tables (cash_reserves, debts) and are
 * matched the same way — by Plaid account id first, then by an unlinked row
 * with the same name — so linking a bank you already tracked by hand adopts
 * the row instead of adding a second one.
 * ------------------------------------------------------------------------ */


export type BalanceCounts = {
  cashLinked: number;
  cashAdopted: number;
  cashCreated: number;
  debtsLinked: number;
  debtsAdopted: number;
  debtsCreated: number;
};

const EMPTY_BALANCES: BalanceCounts = {
  cashLinked: 0,
  cashAdopted: 0,
  cashCreated: 0,
  debtsLinked: 0,
  debtsAdopted: 0,
  debtsCreated: 0,
};

/**
 * Pull depository balances and loan balances for one Plaid item.
 *
 * Plaid reports a loan's balance as a positive number on an account whose
 * type is `credit` or `loan`. It is stored here as a debt, and the mortgage
 * detail endpoint fills in the rate and payment when the institution
 * provides them — those are the fields that would otherwise have to be
 * retyped from a statement every time they change.
 */
export async function syncPlaidBalances(options: {
  client: PlaidApi;
  clerkId: string;
  itemId: string;
  accessToken: string;
  institutionName: string;
}): Promise<BalanceCounts> {
  const { client, clerkId, itemId, accessToken, institutionName } = options;
  const db = getDb();
  const counts: BalanceCounts = { ...EMPTY_BALANCES };

  const { data } = await client.accountsBalanceGet({ access_token: accessToken });

  // Rate and payment for a mortgage, when the institution reports them.
  // Not every one does, and a plain balance is still worth having.
  const mortgageDetail = new Map<
    string,
    { rate: number | null; payment: number | null; origination: number | null }
  >();
  // Asked only when there is a mortgage, since that is all it is read for: the
  // first call adds Liabilities to the item, and Plaid bills it from then on.
  if (data.accounts.some((a) => a.type === "loan" && a.subtype === "mortgage")) {
    try {
      const liabilities = await client.liabilitiesGet({ access_token: accessToken });
      for (const m of liabilities.data.liabilities.mortgage ?? []) {
        mortgageDetail.set(m.account_id, {
          rate: m.interest_rate?.percentage ?? null,
          payment: m.next_monthly_payment ?? null,
          origination: m.origination_principal_amount ?? null,
        });
      }
    } catch {
      // Liabilities is a separately enabled product and not every institution
      // supports it. The balance above is the part that matters.
    }
  }

  const unlinkedCash = await db
    .select()
    .from(cashReserves)
    .where(and(eq(cashReserves.clerkId, clerkId), isNull(cashReserves.plaidAccountId)));
  const unlinkedDebts = await db
    .select()
    .from(debts)
    .where(and(eq(debts.clerkId, clerkId), isNull(debts.plaidAccountId)));
  const cashPool = new Map(unlinkedCash.map((r) => [r.id, r]));
  const debtPool = new Map(unlinkedDebts.map((r) => [r.id, r]));

  for (const pa of data.accounts) {
    const name = pa.name || pa.official_name || "Account";
    const now = new Date();

    if (pa.type === "depository") {
      // Plaid's `available` excludes holds; `current` is the statement figure
      // and is the one a person recognises as their balance.
      const balance = pa.balances.current ?? pa.balances.available ?? 0;

      const [existing] = await db
        .select({ id: cashReserves.id })
        .from(cashReserves)
        .where(and(eq(cashReserves.clerkId, clerkId), eq(cashReserves.plaidAccountId, pa.account_id)))
        .limit(1);

      if (existing) {
        await db
          .update(cashReserves)
          .set({ balance: String(balance), institution: institutionName, lastSyncedAt: now, updatedAt: now })
          .where(eq(cashReserves.id, existing.id));
        counts.cashLinked++;
        continue;
      }

      const adoptable = [...cashPool.values()].find(
        (r) => normalizeName(r.name) === normalizeName(name)
      );
      if (adoptable) {
        cashPool.delete(adoptable.id);
        await db
          .update(cashReserves)
          .set({
            balance: String(balance),
            institution: institutionName,
            plaidItemId: itemId,
            plaidAccountId: pa.account_id,
            dataSource: "plaid",
            lastSyncedAt: now,
            updatedAt: now,
          })
          .where(eq(cashReserves.id, adoptable.id));
        counts.cashAdopted++;
        continue;
      }

      await db.insert(cashReserves).values({
        clerkId,
        name,
        institution: institutionName,
        balance: String(balance),
        accountType: mapDepositorySubtype(pa.subtype),
        plaidItemId: itemId,
        plaidAccountId: pa.account_id,
        dataSource: "plaid",
        lastSyncedAt: now,
      });
      counts.cashCreated++;
      continue;
    }

    if (pa.type === "loan" || pa.type === "credit") {
      const balance = pa.balances.current ?? 0;
      const detail = mortgageDetail.get(pa.account_id);

      const [existing] = await db
        .select({ id: debts.id })
        .from(debts)
        .where(and(eq(debts.clerkId, clerkId), eq(debts.plaidAccountId, pa.account_id)))
        .limit(1);

      if (existing) {
        await db
          .update(debts)
          .set({
            currentBalance: String(balance),
            ...(detail?.rate != null ? { interestRate: String(detail.rate) } : {}),
            ...(detail?.payment != null ? { monthlyPayment: String(detail.payment) } : {}),
            lastSyncedAt: now,
            updatedAt: now,
          })
          .where(eq(debts.id, existing.id));
        counts.debtsLinked++;
        continue;
      }

      const adoptable = [...debtPool.values()].find(
        (r) => normalizeName(r.name) === normalizeName(name)
      );
      if (adoptable) {
        debtPool.delete(adoptable.id);
        await db
          .update(debts)
          .set({
            currentBalance: String(balance),
            ...(detail?.rate != null ? { interestRate: String(detail.rate) } : {}),
            ...(detail?.payment != null ? { monthlyPayment: String(detail.payment) } : {}),
            plaidItemId: itemId,
            plaidAccountId: pa.account_id,
            dataSource: "plaid",
            lastSyncedAt: now,
            updatedAt: now,
          })
          .where(eq(debts.id, adoptable.id));
        counts.debtsAdopted++;
        continue;
      }

      await db.insert(debts).values({
        clerkId,
        name,
        debtType: mapDebtSubtype(pa.type, pa.subtype),
        currentBalance: String(balance),
        originalBalance: detail?.origination != null ? String(detail.origination) : null,
        // A rate is required on the row; a linked account that does not report
        // one gets zero rather than blocking the link, and can be corrected.
        interestRate: String(detail?.rate ?? 0),
        monthlyPayment: String(detail?.payment ?? 0),
        plaidItemId: itemId,
        plaidAccountId: pa.account_id,
        dataSource: "plaid",
        lastSyncedAt: now,
      });
      counts.debtsCreated++;
    }
  }

  return counts;
}

function mapDepositorySubtype(
  subtype: string | null | undefined
): "checking" | "savings" | "high_yield_savings" | "money_market" | "cd" | "other_cash" {
  switch (subtype) {
    case "checking":
      return "checking";
    case "savings":
      return "savings";
    case "money market":
      return "money_market";
    case "cd":
      return "cd";
    default:
      return "other_cash";
  }
}

function mapDebtSubtype(
  type: string,
  subtype: string | null | undefined
): "mortgage" | "auto_loan" | "student_loan" | "heloc" | "credit_card" | "other_debt" {
  if (type === "credit") return "credit_card";
  switch (subtype) {
    case "mortgage":
      return "mortgage";
    case "auto":
      return "auto_loan";
    case "student":
      return "student_loan";
    case "home equity":
      return "heloc";
    default:
      return "other_debt";
  }
}
