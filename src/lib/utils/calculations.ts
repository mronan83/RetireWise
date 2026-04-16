import type { Holding } from "../types";

export function calculateGainLoss(holding: Holding): {
  gainLoss: number;
  gainLossPct: number;
} {
  const currentValue = Number(holding.currentValue);
  const costBasis =
    Number(holding.shares) * Number(holding.costBasisPerShare);
  const gainLoss = currentValue - costBasis;
  const gainLossPct = costBasis > 0 ? (gainLoss / costBasis) * 100 : 0;
  return { gainLoss, gainLossPct };
}

export function calculateAllocation(
  holdings: Holding[]
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

export function calculatePortfolioSummary(holdings: Holding[]) {
  const totalValue = holdings.reduce(
    (sum, h) => sum + Number(h.currentValue),
    0
  );
  const totalCostBasis = holdings.reduce(
    (sum, h) => sum + Number(h.shares) * Number(h.costBasisPerShare),
    0
  );
  const totalGainLoss = totalValue - totalCostBasis;
  const totalGainLossPct =
    totalCostBasis > 0 ? (totalGainLoss / totalCostBasis) * 100 : 0;
  const allocation = calculateAllocation(holdings);

  return {
    totalValue,
    totalCostBasis,
    totalGainLoss,
    totalGainLossPct,
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
