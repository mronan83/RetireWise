import { tool } from "ai";
import { z } from "zod";
import { auth } from "@clerk/nextjs/server";
import { getHoldingsByClerkId } from "../queries/holdings";
import { getAccounts } from "../queries/accounts";
import { calculatePortfolioSummary } from "../utils/calculations";
import { ASSET_CLASS_LABELS, ACCOUNT_TYPE_LABELS } from "../constants";

export const getPortfolioSummaryTool = tool({
  description:
    "Get a complete summary of the user's investment portfolio including total value, allocation by asset class, and gain/loss figures.",
  inputSchema: z.object({}),
  execute: async () => {
    const { userId } = await auth();
    if (!userId) return { error: "Not authenticated" };

    const [holdings, accountsList] = await Promise.all([
      getHoldingsByClerkId(userId),
      getAccounts(userId),
    ]);

    const summary = calculatePortfolioSummary(holdings);

    const allocationLabeled = Object.fromEntries(
      Object.entries(summary.allocation).map(([k, v]) => [
        ASSET_CLASS_LABELS[k] || k,
        { value: Math.round(v.value * 100) / 100, percentage: Math.round(v.pct * 100) / 100 },
      ])
    );

    const accountSummaries = accountsList.map((a) => ({
      name: a.name,
      institution: a.institution,
      type: ACCOUNT_TYPE_LABELS[a.accountType] || a.accountType,
      value: holdings
        .filter((h) => h.accountId === a.id)
        .reduce((sum, h) => sum + Number(h.currentValue), 0),
    }));

    return {
      totalValue: Math.round(summary.totalValue * 100) / 100,
      totalCostBasis: Math.round(summary.totalCostBasis * 100) / 100,
      totalGainLoss: Math.round(summary.totalGainLoss * 100) / 100,
      totalGainLossPct: Math.round(summary.totalGainLossPct * 100) / 100,
      holdingCount: holdings.length,
      accountCount: accountsList.length,
      allocationByAssetClass: allocationLabeled,
      accounts: accountSummaries,
    };
  },
});
