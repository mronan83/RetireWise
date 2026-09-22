/**
 * What the portfolio actually paid, from the record of it being paid.
 *
 * This replaces a table of hardcoded yields — `VTI: 1.3, VOO: 1.3, BND: 3.5`
 * — multiplied by current value. That table had three problems, in
 * increasing order of severity:
 *
 *   1. The numbers were guesses, entered once and never revisited.
 *   2. Any ticker absent from it fell through to a per-asset-class default,
 *      so an employer plan's `VG.IS.TL.INTL.STK.MK` was assigned 1.5% for
 *      being "us_stock" — a figure derived from nothing about that fund.
 *   3. It could not return "unknown". Every position produced a number, so
 *      the household total always looked complete, and a portfolio with no
 *      distribution record at all reported a confident annual income.
 *
 * There are now 182 real distribution rows spanning two years. The rules
 * below exist because that record is uneven, and saying so is the point.
 */

/** The trailing window a figure is quoted over. */
export const WINDOW_DAYS = 365;

/**
 * How late an account's history may start and still be said to cover the
 * window. Matches the snapshot query's grace: a window opening on a weekend
 * or a holiday is absorbed, a window missed by a month is not.
 */
export const GRACE_DAYS = 7;

export type DistributionRow = {
  accountId: string;
  date: string;
  /** Signed as stored. Plaid writes cash INTO the account as negative. */
  amount: string | number;
  ticker: string | null;
  plaidSecurityId: string | null;
  description: string | null;
  /** Non-null and positive when the distribution bought more shares. */
  shares: string | number | null;
};

export function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().split("T")[0];
}

/**
 * The cash a distribution row represents, as a positive number.
 *
 * Plaid signs an investment transaction by the direction money moves
 * relative to the account: a buy is positive because cash leaves, a dividend
 * is negative because cash arrives. All 182 rows stored here are negative,
 * the largest being -685.75.
 *
 * So summing `amount` reports the year's income as a negative number, and
 * `Math.abs` — which is what the transactions page uses — would turn a row
 * with the wrong sign into income rather than revealing it. This returns
 * null for a row that is not income at all, so a sign that flips upstream
 * surfaces as a named exclusion rather than as a plausible total.
 */
export function distributionAmount(row: DistributionRow): number | null {
  const raw = Number(row.amount);
  if (!Number.isFinite(raw)) return null;
  const cash = -raw;
  if (cash <= 0) return null;
  return cash;
}

/** A distribution that bought more shares rather than settling as cash. */
export function isReinvested(row: DistributionRow): boolean {
  const shares = row.shares === null ? 0 : Number(row.shares);
  return Number.isFinite(shares) && shares > 0;
}

/**
 * Who paid it.
 *
 * 27 of these rows carry neither a ticker nor a security id — their security
 * was not described in the page Plaid returned — but the description still
 * names the fund: "FID TOTAL BOND - dividend". That is $838.81, 17% of the
 * two-year total, and dropping it would understate the account while the
 * total still looked whole.
 */
export function payerLabel(row: DistributionRow): string | null {
  if (row.ticker) return row.ticker;
  const desc = row.description?.trim();
  if (!desc) return null;
  const name = desc.split(" - ")[0]?.trim();
  return name && name.length > 0 ? name : null;
}

/**
 * Whether an account's transaction history reaches back across the window.
 *
 * Without this an account linked a fortnight ago reports its fortnight of
 * distributions as a year's income. The Mutual of Omaha plan here has four
 * transactions covering 15 days; annualising from that is how a $0 becomes
 * a number and a small number becomes a large one.
 */
export function coversWindow(
  earliestTxn: string | null,
  asOf: string,
  windowDays: number = WINDOW_DAYS
): boolean {
  if (!earliestTxn) return false;
  return earliestTxn <= addDays(addDays(asOf, -windowDays), GRACE_DAYS);
}

export type AccountWindow = {
  accountId: string;
  name: string;
  owner: string;
  /** Oldest transaction of any kind, which is how far back the record goes. */
  earliestTxn: string | null;
  /** Market value of the positions held in it today. */
  value: number;
};

export type PayerTotal = {
  payer: string;
  accountId: string;
  account: string;
  owner: string;
  total: number;
  payments: number;
  reinvested: number;
  cash: number;
  first: string;
  last: string;
};

export type AccountDividends = {
  accountId: string;
  account: string;
  owner: string;
  value: number;
  /** Null when the history does not cover the window. */
  total: number | null;
  /** Trailing yield on today's value. Null when total is null or value is 0. */
  trailingYield: number | null;
  payments: number;
  reinvested: number;
  cash: number;
  status: "reported" | "partial_window" | "none_reported" | "history_too_short";
  /** For a partial window, the span actually observed. */
  observedFrom: string | null;
  note: string;
};

export type DividendSummary = {
  asOf: string;
  windowFrom: string;
  /** Sum across accounts whose history covers the window AND reported any. */
  total: number;
  /**
   * Real distributions from accounts whose history is shorter than the
   * window. Excluded from `total` because they do not describe a year, and
   * reported here because they were nonetheless paid.
   */
  observedOutsideWindow: number;
  monthly: number;
  reinvested: number;
  cash: number;
  self: number;
  spouse: number;
  /** Share of portfolio value the total actually speaks for, 0..1. */
  valueCovered: number;
  valueTotal: number;
  accounts: AccountDividends[];
  topPayers: PayerTotal[];
  /** Rows excluded because they were not income; empty is the normal case. */
  excluded: number;
  /** Accounts the total says nothing about, and why. */
  gaps: { account: string; reason: string }[];
};

/**
 * Roll the record up without ever inventing a figure for a gap in it.
 *
 * The three account outcomes are deliberately distinct, because collapsing
 * them is what made the old version dishonest:
 *
 *   reported           — the history covers the year and distributions are in it
 *   none_reported      — the history covers the year and contains none. NOT the
 *                        same as "this account pays nothing": an employer plan
 *                        may simply not report distributions to Plaid, and one
 *                        of the two 401(k)s here reports 127 while the other,
 *                        at the same custodian, reports none.
 *   history_too_short  — the record does not reach back a year, so it supports
 *                        no annual figure at all.
 *
 * Only the first contributes to the total, and `valueCovered` says what
 * fraction of the portfolio that total is speaking for.
 */
export function summarizeDividends(
  rows: DistributionRow[],
  accounts: AccountWindow[],
  asOf: string,
  windowDays: number = WINDOW_DAYS
): DividendSummary {
  const windowFrom = addDays(asOf, -windowDays);
  const byAccount = new Map(accounts.map((a) => [a.accountId, a]));

  let excluded = 0;
  const payerKey = new Map<string, PayerTotal>();
  const perAccount = new Map<
    string,
    { total: number; payments: number; reinvested: number; cash: number }
  >();

  for (const row of rows) {
    if (row.date < windowFrom || row.date > asOf) continue;
    const amount = distributionAmount(row);
    if (amount === null) {
      excluded++;
      continue;
    }
    const account = byAccount.get(row.accountId);
    if (!account) continue;

    const acc = perAccount.get(row.accountId) ?? {
      total: 0,
      payments: 0,
      reinvested: 0,
      cash: 0,
    };
    acc.total += amount;
    acc.payments += 1;
    if (isReinvested(row)) acc.reinvested += amount;
    else acc.cash += amount;
    perAccount.set(row.accountId, acc);

    const payer = payerLabel(row) ?? "Unattributed";
    const key = `${row.accountId}|${payer}`;
    const existing = payerKey.get(key);
    if (existing) {
      existing.total += amount;
      existing.payments += 1;
      if (isReinvested(row)) existing.reinvested += amount;
      else existing.cash += amount;
      if (row.date < existing.first) existing.first = row.date;
      if (row.date > existing.last) existing.last = row.date;
    } else {
      payerKey.set(key, {
        payer,
        accountId: row.accountId,
        account: account.name,
        owner: account.owner,
        total: amount,
        payments: 1,
        reinvested: isReinvested(row) ? amount : 0,
        cash: isReinvested(row) ? 0 : amount,
        first: row.date,
        last: row.date,
      });
    }
  }

  const results: AccountDividends[] = [];
  const gaps: { account: string; reason: string }[] = [];
  let total = 0;
  let observedOutsideWindow = 0;
  let reinvested = 0;
  let cash = 0;
  let self = 0;
  let spouse = 0;
  let valueCovered = 0;
  let valueTotal = 0;

  for (const a of accounts) {
    valueTotal += a.value;
    const seen = perAccount.get(a.accountId);
    const covered = coversWindow(a.earliestTxn, asOf, windowDays);

    if (!covered) {
      const reason = a.earliestTxn
        ? `transaction history starts ${a.earliestTxn}, which does not reach back a year`
        : "no transaction history at all";
      gaps.push({ account: a.name, reason });

      // Distributions were recorded, they are simply not a year's worth. The
      // figure is real and is reported as what it is: a partial observation,
      // kept out of the annual total and given no yield.
      if (seen && seen.total > 0) {
        observedOutsideWindow += seen.total;
        results.push({
          accountId: a.accountId,
          account: a.name,
          owner: a.owner,
          value: a.value,
          total: seen.total,
          trailingYield: null,
          payments: seen.payments,
          reinvested: seen.reinvested,
          cash: seen.cash,
          status: "partial_window",
          observedFrom: a.earliestTxn,
          note: `${seen.payments} distributions totalling ${seen.total.toFixed(2)} since ${a.earliestTxn}, but ${reason} — so this is not an annual figure and is excluded from the household total.`,
        });
        continue;
      }

      results.push({
        accountId: a.accountId,
        account: a.name,
        owner: a.owner,
        value: a.value,
        total: null,
        trailingYield: null,
        payments: 0,
        reinvested: 0,
        cash: 0,
        status: "history_too_short",
        observedFrom: a.earliestTxn,
        note: `No annual figure: ${reason}.`,
      });
      continue;
    }

    if (!seen || seen.total === 0) {
      const reason =
        "a full year of transactions is on record and none of them is a distribution — which may mean the plan does not report them, not that none were paid";
      gaps.push({ account: a.name, reason });
      results.push({
        accountId: a.accountId,
        account: a.name,
        owner: a.owner,
        value: a.value,
        total: null,
        trailingYield: null,
        payments: 0,
        reinvested: 0,
        cash: 0,
        status: "none_reported",
        observedFrom: a.earliestTxn,
        note: `No distributions reported. ${reason}.`,
      });
      continue;
    }

    total += seen.total;
    reinvested += seen.reinvested;
    cash += seen.cash;
    valueCovered += a.value;
    if (a.owner === "spouse") spouse += seen.total;
    else self += seen.total;

    results.push({
      accountId: a.accountId,
      account: a.name,
      owner: a.owner,
      value: a.value,
      total: seen.total,
      trailingYield: a.value > 0 ? (seen.total / a.value) * 100 : null,
      payments: seen.payments,
      reinvested: seen.reinvested,
      cash: seen.cash,
      status: "reported",
      observedFrom: a.earliestTxn,
      note: `${seen.payments} distributions on record between ${windowFrom} and ${asOf}.`,
    });
  }

  return {
    asOf,
    windowFrom,
    total,
    observedOutsideWindow,
    monthly: total / 12,
    reinvested,
    cash,
    self,
    spouse,
    valueCovered: valueTotal > 0 ? valueCovered / valueTotal : 0,
    valueTotal,
    accounts: results,
    topPayers: [...payerKey.values()].sort((a, b) => b.total - a.total),
    excluded,
    gaps,
  };
}
