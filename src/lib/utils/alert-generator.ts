import { eq } from "drizzle-orm";
import { getDb } from "../db";
import { alerts, accounts, userPreferences } from "../db/schema";
import { getHoldingsByClerkId } from "../queries/holdings";
import { getLatestSnapshot } from "../queries/snapshots";
import { calculateAllocation, calculateAllocationDrift } from "./calculations";
import { DEFAULT_TARGET_ALLOCATION, ASSET_CLASS_LABELS } from "../constants";

/**
 * Generate alerts based on current portfolio state.
 * Called during the nightly cron after price updates.
 */
export async function generateAlerts(clerkId: string) {
  const db = getDb();
  const [holdings, prefs, latestSnapshot] = await Promise.all([
    getHoldingsByClerkId(clerkId),
    db.select().from(userPreferences).where(eq(userPreferences.clerkId, clerkId)).limit(1),
    getLatestSnapshot(clerkId),
  ]);

  const newAlerts: {
    type: "allocation_drift" | "large_daily_move" | "concentration_risk" | "rebalance_needed";
    severity: "info" | "warning" | "critical";
    title: string;
    message: string;
    data?: Record<string, unknown>;
  }[] = [];

  const totalValue = holdings.reduce((s, h) => s + Number(h.currentValue), 0);
  if (totalValue === 0) return;

  // 1. Allocation drift check
  const allocation = calculateAllocation(holdings);
  const target = (prefs[0]?.targetAllocation as Record<string, number>) || DEFAULT_TARGET_ALLOCATION;
  const currentPcts: Record<string, number> = {};
  for (const [k, v] of Object.entries(allocation)) {
    currentPcts[k] = v.pct;
  }
  const drift = calculateAllocationDrift(currentPcts, target);
  const bigDrifts = Object.entries(drift).filter(([, v]) => Math.abs(v.drift) > 5);

  if (bigDrifts.length > 0) {
    const driftList = bigDrifts
      .map(([k, v]) => `${ASSET_CLASS_LABELS[k] || k}: ${v.drift > 0 ? "+" : ""}${v.drift.toFixed(1)}%`)
      .join(", ");
    newAlerts.push({
      type: "allocation_drift",
      severity: bigDrifts.some(([, v]) => Math.abs(v.drift) > 10) ? "critical" : "warning",
      title: "Portfolio drift detected",
      message: `${bigDrifts.length} asset class(es) have drifted more than 5% from target: ${driftList}. Consider rebalancing.`,
      data: { drifts: Object.fromEntries(bigDrifts) },
    });
  }

  // 2. Large daily move check
  if (latestSnapshot) {
    const dailyChangePct = Number(latestSnapshot.dailyChangePct || 0);
    if (Math.abs(dailyChangePct) > 2) {
      newAlerts.push({
        type: "large_daily_move",
        severity: Math.abs(dailyChangePct) > 5 ? "critical" : "warning",
        title: `Portfolio ${dailyChangePct > 0 ? "up" : "down"} ${Math.abs(dailyChangePct).toFixed(1)}% today`,
        message: `Your portfolio moved ${dailyChangePct > 0 ? "+" : ""}${dailyChangePct.toFixed(2)}% ($${Math.abs(Number(latestSnapshot.dailyChange || 0)).toLocaleString()}) in a single day.`,
        data: { dailyChangePct, dailyChange: Number(latestSnapshot.dailyChange) },
      });
    }
  }

  // 3. Concentration risk check
  const sortedHoldings = [...holdings].sort(
    (a, b) => Number(b.currentValue) - Number(a.currentValue)
  );
  if (sortedHoldings.length > 0 && totalValue > 0) {
    const topHolding = sortedHoldings[0];
    const topPct = (Number(topHolding.currentValue) / totalValue) * 100;
    if (topPct > 25) {
      newAlerts.push({
        type: "concentration_risk",
        severity: topPct > 40 ? "critical" : "warning",
        title: `High concentration in ${topHolding.ticker}`,
        message: `${topHolding.ticker} makes up ${topPct.toFixed(1)}% of your portfolio ($${Number(topHolding.currentValue).toLocaleString()}). Consider diversifying.`,
        data: { ticker: topHolding.ticker, pct: topPct },
      });
    }
  }

  // Insert new alerts
  if (newAlerts.length > 0) {
    await db.insert(alerts).values(
      newAlerts.map((a) => ({
        clerkId,
        type: a.type,
        severity: a.severity,
        title: a.title,
        message: a.message,
        data: a.data,
      }))
    );
  }

  return newAlerts.length;
}
