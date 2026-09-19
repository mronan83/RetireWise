import { tool } from "ai";
import { z } from "zod";
import { getApiUserId } from "@/lib/auth-helpers";
import { getHoldingsByClerkId } from "../queries/holdings";
import { calculateGainLoss } from "../utils/calculations";
import { ASSET_CLASS_LABELS } from "../constants";

export const getHoldingsDetailTool = tool({
  description:
    "Get detailed information about all holdings including ticker, shares, current value, cost basis, and gain/loss for each position.",
  inputSchema: z.object({
    sortBy: z
      .enum(["value", "gainLoss", "ticker"])
      .optional()
      .describe("How to sort the holdings list"),
  }),
  execute: async ({ sortBy = "value" }) => {
    // Holdings are keyed by the household id, not the signed-in account's own
    // id; the raw id reads back an empty portfolio instead of an error.
    const userId = await getApiUserId();
    if (!userId) return { error: "Not authenticated" };

    const holdings = await getHoldingsByClerkId(userId);

    const detailed = holdings.map((h) => {
      const { gainLoss, gainLossPct } = calculateGainLoss(h);
      return {
        ticker: h.ticker,
        name: h.name,
        assetClass: ASSET_CLASS_LABELS[h.assetClass] || h.assetClass,
        shares: Number(h.shares),
        currentPrice: Number(h.currentPrice),
        currentValue: Number(h.currentValue),
        costBasisPerShare: Number(h.costBasisPerShare),
        totalCostBasis: Number(h.shares) * Number(h.costBasisPerShare),
        gainLoss: Math.round(gainLoss * 100) / 100,
        gainLossPct: Math.round(gainLossPct * 100) / 100,
        account: h.accountName,
      };
    });

    if (sortBy === "value") {
      detailed.sort((a, b) => b.currentValue - a.currentValue);
    } else if (sortBy === "gainLoss") {
      detailed.sort((a, b) => b.gainLoss - a.gainLoss);
    } else {
      detailed.sort((a, b) => a.ticker.localeCompare(b.ticker));
    }

    return { holdings: detailed, count: detailed.length };
  },
});
