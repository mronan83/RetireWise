/**
 * Cost basis, and the difference between zero and unknown.
 *
 * Plaid reports cost basis for retail brokerage accounts and, for many
 * employer plans, does not report it at all. The sync used to paper over
 * that with `shares * currentPrice`, so an account with no reported basis
 * rendered as "+$0.00 (+0.00%)" — a confident claim of no gain, made about
 * a position that had in fact gained thousands.
 *
 * Worse, the fabricated value was written to the database. A sync in which
 * Plaid omitted cost basis overwrote a real basis that an earlier sync had
 * recorded, so the true figure was destroyed rather than merely hidden.
 *
 * Everything here exists to keep those two states apart. `null` means the
 * provider did not say. It is never rounded, defaulted, or summed into a
 * total as if it were zero.
 */

export type BasisHolding = {
  shares: string | number;
  costBasisPerShare: string | number | null;
};

/** The total cost of one position, or null if the provider did not report it. */
export function positionBasis(h: BasisHolding): number | null {
  if (h.costBasisPerShare === null || h.costBasisPerShare === undefined) return null;
  const perShare = Number(h.costBasisPerShare);
  const shares = Number(h.shares);
  if (!Number.isFinite(perShare) || !Number.isFinite(shares)) return null;
  return perShare * shares;
}

export type BasisRollup = {
  /**
   * Total cost across the positions, or null when any one of them is
   * unknown.
   *
   * All-or-nothing on purpose. Summing only the positions that have a basis
   * gives a number smaller than the true cost, against a value that includes
   * every position — so the gain comes out too high, and the more basis is
   * missing, the better the account looks. There is no honest partial total,
   * so there is no partial total.
   */
  basis: number | null;
  /** Positions whose basis the provider reported. */
  known: number;
  /** Positions it did not. */
  unknown: number;
};

export function rollupBasis(holdings: BasisHolding[]): BasisRollup {
  let basis = 0;
  let known = 0;
  let unknown = 0;

  for (const h of holdings) {
    const b = positionBasis(h);
    if (b === null) {
      unknown++;
    } else {
      basis += b;
      known++;
    }
  }

  return { basis: unknown > 0 ? null : basis, known, unknown };
}

export type GainLoss = {
  costBasis: number;
  gainLoss: number;
  gainLossPct: number;
};

/**
 * Gain and loss against a known basis, or null when there isn't one.
 *
 * A zero basis is also refused: a position bought at zero has an infinite
 * percentage return, and the figure that used to come out of that division
 * said more about the arithmetic than about the account.
 */
export function gainLossFor(value: number, basis: number | null): GainLoss | null {
  if (basis === null || !(basis > 0)) return null;
  const gainLoss = value - basis;
  return { costBasis: basis, gainLoss, gainLossPct: (gainLoss / basis) * 100 };
}

/** What to tell the reader when part or all of the basis is missing. */
export function missingBasisNote(rollup: BasisRollup): string | null {
  if (rollup.unknown === 0) return null;
  const total = rollup.known + rollup.unknown;
  return rollup.unknown === total
    ? total === 1
      ? "Cost basis not reported by this institution"
      : `Cost basis not reported for any of the ${total} positions`
    : `Cost basis not reported for ${rollup.unknown} of ${total} positions`;
}

/** Placeholder used wherever a report would otherwise print a fabricated figure. */
export const NO_BASIS = "not reported";

/** Format a figure that may be unknown, for plain-text and HTML reports. */
export function orNoBasis(
  value: number | null,
  format: (n: number) => string
): string {
  return value === null ? NO_BASIS : format(value);
}
