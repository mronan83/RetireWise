import { gainLossFor, positionBasis, rollupBasis } from "./cost-basis";

/**
 * The fields these calculations actually read.
 *
 * Typed structurally rather than as the whole `Holding` row: every column
 * added to the table used to break every caller here, which is pressure to
 * widen the queries instead of narrowing the contract. Nothing below needs
 * a created_at or a data source.
 */
type ValuedHolding = {
  shares: string | number;
  costBasisPerShare: string | number | null;
  currentValue: string | number;
  assetClass: string;
};

/**
 * Gain and loss for one position, or null when the basis is unknown.
 *
 * It used to return `{ gainLoss: currentValue, gainLossPct: 0 }` for an
 * unknown basis, because an absent basis read as Number(null) === 0: the
 * whole position counted as profit, at a stated 0%. Two wrong numbers that
 * happened to look like a rounding artefact.
 */
export function calculateGainLoss(holding: ValuedHolding): {
  gainLoss: number;
  gainLossPct: number;
} | null {
  return gainLossFor(Number(holding.currentValue), positionBasis(holding));
}

export function calculateAllocation(
  holdings: ValuedHolding[]
): Record<string, { value: number; pct: number }> {
  const totalValue = holdings.reduce(
    (sum, h) => sum + Number(h.currentValue),
    0
  );

  const grouped: Record<string, number> = {};
  for (const holding of holdings) {
    const cls = holding.assetClass;
    grouped[cls] = (grouped[cls] || 0) + Number(holding.currentValue);
  }

  const allocation: Record<string, { value: number; pct: number }> = {};
  for (const [cls, value] of Object.entries(grouped)) {
    allocation[cls] = {
      value,
      pct: totalValue > 0 ? (value / totalValue) * 100 : 0,
    };
  }
  return allocation;
}

export function calculatePortfolioSummary(holdings: ValuedHolding[]) {
  const totalValue = holdings.reduce(
    (sum, h) => sum + Number(h.currentValue),
    0
  );
  // All-or-nothing: see rollupBasis. Summing only the positions that report
  // a basis gives a cost below the truth against a value that includes every
  // position, so the gain comes out too high — and the more basis is missing,
  // the better the portfolio looks.
  const rollup = rollupBasis(holdings);
  const gl = gainLossFor(totalValue, rollup.basis);
  const allocation = calculateAllocation(holdings);

  return {
    totalValue,
    totalCostBasis: rollup.basis,
    totalGainLoss: gl?.gainLoss ?? null,
    totalGainLossPct: gl?.gainLossPct ?? null,
    positionsWithoutBasis: rollup.unknown,
    allocation,
  };
}

export function calculateCAGR(
  startValue: number,
  endValue: number,
  years: number
): number {
  if (startValue <= 0 || years <= 0) return 0;
  return (Math.pow(endValue / startValue, 1 / years) - 1) * 100;
}

export function calculateAllocationDrift(
  current: Record<string, number>,
  target: Record<string, number>
): Record<string, { current: number; target: number; drift: number }> {
  const result: Record<
    string,
    { current: number; target: number; drift: number }
  > = {};

  const allKeys = new Set([
    ...Object.keys(current),
    ...Object.keys(target),
  ]);

  for (const key of allKeys) {
    const c = current[key] || 0;
    const t = target[key] || 0;
    result[key] = { current: c, target: t, drift: c - t };
  }

  return result;
}
