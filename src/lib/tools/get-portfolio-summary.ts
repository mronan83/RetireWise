import { tool } from "ai";
import { z } from "zod";
import { getApiUserId } from "@/lib/auth-helpers";
import { getHoldingsByClerkId } from "../queries/holdings";
import { getAccounts } from "../queries/accounts";
import { calculatePortfolioSummary } from "../utils/calculations";
import { ASSET_CLASS_LABELS, ACCOUNT_TYPE_LABELS } from "../constants";

export const getPortfolioSummaryTool = tool({
  description:
    "Get a complete summary of the user's investment portfolio including total value, allocation by asset class, and gain/loss figures.",
  inputSchema: z.object({}),
  execute: async () => {
    // Holdings are keyed by the household id, not the signed-in account's own
    // id; the raw id reads back an empty portfolio instead of an error.
    const userId = await getApiUserId();
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
      // null rather than a figure built from the positions that happen to
      // report a basis, which would be a cost below the truth and a gain
      // above it — and the advisor would quote the flattering version.
      totalCostBasis:
        summary.totalCostBasis === null ? null : Math.round(summary.totalCostBasis * 100) / 100,
      totalGainLoss:
        summary.totalGainLoss === null ? null : Math.round(summary.totalGainLoss * 100) / 100,
      totalGainLossPct:
        summary.totalGainLossPct === null ? null : Math.round(summary.totalGainLossPct * 100) / 100,
      positionsWithoutCostBasis: summary.positionsWithoutBasis,
      holdingCount: holdings.length,
      accountCount: accountsList.length,
      allocationByAssetClass: allocationLabeled,
      accounts: accountSummaries,
    };
  },
});
