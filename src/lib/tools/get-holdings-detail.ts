import { tool } from "ai";
import { z } from "zod";
import { getApiUserId } from "@/lib/auth-helpers";
import { getHoldingsByClerkId } from "../queries/holdings";
import { calculateGainLoss } from "../utils/calculations";
import { positionBasis } from "../utils/cost-basis";
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
      /**
       * null, not zero, when the institution reported no cost basis.
       *
       * The advisor reads these figures straight out and quotes them. A
       * fabricated basis made every employer-plan position look like a
       * position with no gain, and the advisor said so in as many words.
       */
      const gl = calculateGainLoss(h);
      const basis = positionBasis(h);
      return {
        ticker: h.ticker,
        name: h.name,
        assetClass: ASSET_CLASS_LABELS[h.assetClass] || h.assetClass,
        shares: Number(h.shares),
        currentPrice: Number(h.currentPrice),
        currentValue: Number(h.currentValue),
        costBasisPerShare:
          h.costBasisPerShare === null ? null : Number(h.costBasisPerShare),
        totalCostBasis: basis === null ? null : Math.round(basis * 100) / 100,
        gainLoss: gl ? Math.round(gl.gainLoss * 100) / 100 : null,
        gainLossPct: gl ? Math.round(gl.gainLossPct * 100) / 100 : null,
        costBasisReported: gl !== null,
        account: h.accountName,
      };
    });

    if (sortBy === "value") {
      detailed.sort((a, b) => b.currentValue - a.currentValue);
    } else if (sortBy === "gainLoss") {
      // Positions with no knowable gain sort last rather than as zero.
      detailed.sort((a, b) => (b.gainLoss ?? -Infinity) - (a.gainLoss ?? -Infinity));
    } else {
      detailed.sort((a, b) => a.ticker.localeCompare(b.ticker));
    }

    return { holdings: detailed, count: detailed.length };
  },
});
