import { tool } from "ai";
import { z } from "zod";
import { auth } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";
import { getDb } from "../db";
import { userPreferences } from "../db/schema";
import { getHoldingsByClerkId } from "../queries/holdings";
import { calculateAllocation } from "../utils/calculations";
import {
  ASSET_CLASS_LABELS,
  DEFAULT_TARGET_ALLOCATION,
  ACCOUNT_TYPE_LABELS,
} from "../constants";

export const generateRebalancingTradesTool = tool({
  description:
    "Generate specific buy and sell trade recommendations to rebalance the household portfolio back to target allocation. Shows exact dollar amounts and which accounts to trade in.",
  inputSchema: z.object({
    threshold: z
      .number()
      .optional()
      .describe(
        "Minimum drift percentage to trigger a trade recommendation. Default 2%."
      ),
  }),
  execute: async ({ threshold = 2 }) => {
    const { userId } = await auth();
    if (!userId) return { error: "Not authenticated" };

    const db = getDb();
    const [holdings, prefs] = await Promise.all([
      getHoldingsByClerkId(userId),
      db
        .select()
        .from(userPreferences)
        .where(eq(userPreferences.clerkId, userId))
        .limit(1),
    ]);

    const totalValue = holdings.reduce(
      (sum, h) => sum + Number(h.currentValue),
      0
    );

    if (totalValue === 0) {
      return { error: "No holdings to rebalance." };
    }

    const allocation = calculateAllocation(holdings);
    const target =
      (prefs[0]?.targetAllocation as Record<string, number>) ||
      DEFAULT_TARGET_ALLOCATION;

    const trades: {
      action: "BUY" | "SELL";
      assetClass: string;
      amount: number;
      currentPct: number;
      targetPct: number;
      driftPct: number;
      suggestedHoldings: string[];
      suggestedAccounts: string[];
    }[] = [];

    // Calculate what needs to move
    for (const [assetClass, targetPct] of Object.entries(target)) {
      const current = allocation[assetClass];
      const currentPct = current ? current.pct : 0;
      const drift = currentPct - targetPct;

      if (Math.abs(drift) < threshold) continue;

      const targetValue = (targetPct / 100) * totalValue;
      const currentValue = current ? current.value : 0;
      const moveAmount = Math.abs(targetValue - currentValue);

      // Find holdings in this asset class for context
      const classHoldings = holdings.filter(
        (h) => h.assetClass === assetClass
      );
      const tickerList = [
        ...new Set(classHoldings.map((h) => h.ticker)),
      ].slice(0, 5);
      const accountList = [
        ...new Set(
          classHoldings.map(
            (h) =>
              `${h.accountName} (${ACCOUNT_TYPE_LABELS[h.accountType] || h.accountType})`
          )
        ),
      ];

      trades.push({
        action: drift > 0 ? "SELL" : "BUY",
        assetClass: ASSET_CLASS_LABELS[assetClass] || assetClass,
        amount: Math.round(moveAmount * 100) / 100,
        currentPct: Math.round(currentPct * 100) / 100,
        targetPct,
        driftPct: Math.round(drift * 100) / 100,
        suggestedHoldings: tickerList,
        suggestedAccounts: accountList,
      });
    }

    // Sort by absolute drift (biggest imbalances first)
    trades.sort((a, b) => Math.abs(b.driftPct) - Math.abs(a.driftPct));

    return {
      totalPortfolioValue: Math.round(totalValue * 100) / 100,
      threshold,
      trades,
      summary:
        trades.length === 0
          ? `Portfolio is within ${threshold}% of target allocation. No trades needed.`
          : `${trades.length} trades recommended to rebalance. Total rebalancing amount: $${Math.round(trades.reduce((s, t) => s + t.amount, 0)).toLocaleString()}.`,
      taxConsideration:
        "Consider making trades in tax-advantaged accounts (401k, IRA) first to avoid taxable events. Sell in tax-deferred, buy in taxable if adding new money.",
    };
  },
});
