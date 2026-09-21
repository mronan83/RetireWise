/**
 * Time-weighted return, from share counts rather than a transaction feed.
 *
 * The cards used to show `(value_now - value_then) / value_then` and call it
 * a return. It isn't. An account's value rises when the market rises and
 * when money is paid in, and those are indistinguishable from the value
 * alone — so on any account still being funded, a share of what was labelled
 * "performance" was the owner's own paycheck.
 *
 * Separating them does not need investment transactions. Shares that
 * increase between two days were bought; shares that decrease were sold.
 * The cash involved is an external flow, and a return that excludes external
 * flows is a time-weighted return — the same measure a fund reports, and the
 * one that answers "how did this investment do" rather than "how much more
 * is in here".
 *
 * The method is daily-valued TWR: for each day, strip the flow out of the
 * ending value, take the sub-period return against yesterday's close, and
 * chain-link them. With no flows it reduces exactly to plain balance change,
 * which is why it is safe to apply to history recorded before flows were
 * being captured.
 */

export type PositionDay = {
  ticker: string;
  shares: number;
  price: number;
};

export type AccountDay = {
  date: string;
  /** Total account value at the close of this day. */
  value: number;
  /**
   * Positions held at the close, when they were recorded.
   *
   * Absent for history taken before holding_snapshots existed. A day with
   * no positions contributes a sub-period computed as if no money moved,
   * which is exact for an account receiving none and optimistic for one
   * that is — hence `flowsKnownFrom` on the result.
   */
  positions?: PositionDay[];
};

export type TwrResult = {
  /** Chain-linked return over the whole series, as a percentage. */
  pct: number;
  /** Days that contributed a sub-period return. */
  days: number;
  /** Total external money in (positive) or out (negative) over the series. */
  netFlow: number;
  /** The first date from which share counts were available. */
  flowsKnownFrom: string | null;
  /** True when some day's flow could not be determined. */
  hasUnknownFlows: boolean;
};

/**
 * The money that moved in or out between two days.
 *
 * Valued at the later day's price, because that is the price the position
 * is marked at in the later day's value — using the purchase's true price
 * would leave the intraday move inside the flow instead of inside the
 * return. A ticker appearing for the first time is a purchase of all its
 * shares; one that disappears is a full sale.
 */
export function flowBetween(
  prev: PositionDay[] | undefined,
  next: PositionDay[] | undefined
): number | null {
  if (!prev || !next) return null;

  const before = new Map(prev.map((p) => [p.ticker, p.shares]));
  const after = new Map(next.map((p) => [p.ticker, p.shares]));
  const priceOf = new Map(next.map((p) => [p.ticker, p.price]));
  for (const p of prev) if (!priceOf.has(p.ticker)) priceOf.set(p.ticker, p.price);

  let flow = 0;
  for (const ticker of new Set([...before.keys(), ...after.keys()])) {
    const delta = (after.get(ticker) ?? 0) - (before.get(ticker) ?? 0);
    if (delta === 0) continue;
    flow += delta * (priceOf.get(ticker) ?? 0);
  }
  return flow;
}

/**
 * Chain-link daily sub-period returns across a series.
 *
 * Days must be ascending and distinct. Fewer than two days is not a period
 * and returns null rather than zero — "no movement" and "no measurement"
 * being the distinction this codebase keeps losing.
 */
export function timeWeightedReturn(series: AccountDay[]): TwrResult | null {
  if (series.length < 2) return null;

  let factor = 1;
  let days = 0;
  let netFlow = 0;
  let flowsKnownFrom: string | null = null;
  let hasUnknownFlows = false;

  for (let i = 1; i < series.length; i++) {
    const prev = series[i - 1];
    const curr = series[i];
    if (prev.value <= 0) continue;

    const flow = flowBetween(prev.positions, curr.positions);
    if (flow === null) {
      hasUnknownFlows = true;
    } else {
      netFlow += flow;
      if (flowsKnownFrom === null) flowsKnownFrom = prev.date;
    }

    /**
     * The flow is removed from the ending value, not added to the
     * beginning one.
     *
     * Money paid in partway through the day earns the market's move for
     * only part of it; charging the whole day's return against a base that
     * already includes it understates the result. Removing it from the end
     * treats the contribution as earning nothing that day, which is the
     * conservative and conventional choice at daily granularity.
     */
    const adjustedEnd = curr.value - (flow ?? 0);
    const sub = adjustedEnd / prev.value;

    // A sub-period that wipes out the account entirely would make the whole
    // chain zero forever. Treat a non-positive adjusted value as a day with
    // no measurable return rather than a total loss.
    if (!(sub > 0) || !Number.isFinite(sub)) continue;

    factor *= sub;
    days++;
  }

  if (days === 0) return null;

  return {
    pct: (factor - 1) * 100,
    days,
    netFlow,
    flowsKnownFrom,
    hasUnknownFlows,
  };
}

/**
 * TWR over the tail of a series beginning on or after a date.
 *
 * Returns null when the series does not reach the requested start, so a
 * one-year label is never attached to five months of data.
 */
export function twrSince(
  series: AccountDay[],
  startDate: string,
  graceDays = 7
): TwrResult | null {
  if (series.length === 0) return null;
  const earliest = series[0].date;
  const limit = addDays(startDate, graceDays);
  if (earliest > limit) return null;

  // The last day on or before the start is the opening mark; the period's
  // return is measured from that close.
  let openIdx = 0;
  for (let i = 0; i < series.length; i++) {
    if (series[i].date <= startDate) openIdx = i;
    else break;
  }
  return timeWeightedReturn(series.slice(openIdx));
}

export function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().split("T")[0];
}
