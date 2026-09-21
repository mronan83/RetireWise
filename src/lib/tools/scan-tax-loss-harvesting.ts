import { tool } from "ai";
import { z } from "zod";
import { getApiUserId } from "@/lib/auth-helpers";
import { getHoldingsByClerkId } from "../queries/holdings";
import { positionBasis } from "../utils/cost-basis";
import { taxableHoldings } from "../utils/taxability";
import { ASSET_CLASS_LABELS, ACCOUNT_TYPE_LABELS } from "../constants";

// Common replacement funds to maintain market exposure while harvesting losses
const REPLACEMENT_MAP: Record<string, string[]> = {
  VTI: ["ITOT", "SCHB", "SPTM"],
  VOO: ["IVV", "SPY", "SPLG"],
  VXUS: ["IXUS", "ACWX", "FZILX"],
  VEA: ["IEFA", "SCHF", "EFA"],
  VWO: ["IEMG", "SCHE", "EEM"],
  BND: ["AGG", "SCHZ", "FBND"],
  VNQ: ["IYR", "SCHH", "FREL"],
  VBTLX: ["FXNAX", "SCHZ"],
  FXAIX: ["VOO", "IVV", "SPY"],
  FSKAX: ["VTI", "ITOT", "SCHB"],
  QQQ: ["QQQM", "VGT", "FTEC"],
};

export const scanTaxLossHarvestingTool = tool({
  description:
    "Scan all taxable account holdings for unrealized losses that could be harvested to offset capital gains. Identifies candidates and suggests replacement funds to maintain market exposure. Only applies to taxable accounts — tax-advantaged accounts don't benefit from TLH.",
  inputSchema: z.object({
    minimumLoss: z
      .number()
      .optional()
      .describe("Minimum unrealized loss in dollars to flag. Default $100."),
  }),
  execute: async ({ minimumLoss = 100 }) => {
    // Holdings are keyed by the household id, not the signed-in account's own
    // id; the raw id reads back an empty portfolio instead of an error.
    const userId = await getApiUserId();
    if (!userId) return { error: "Not authenticated" };

    const holdings = await getHoldingsByClerkId(userId);

    // Only look at taxable accounts, by the column that records it. The
    // analysis page decides from the same rule whether to offer this at all;
    // if the two disagree, one of them is lying to the household.
    const scannable = taxableHoldings(holdings);

    if (scannable.length === 0) {
      return {
        candidates: [],
        summary:
          "No holdings in taxable accounts. Tax-loss harvesting only applies to taxable brokerage accounts, not 401(k)s, IRAs, or other tax-advantaged accounts.",
      };
    }

    const candidates: {
      ticker: string;
      name: string;
      assetClass: string;
      account: string;
      owner: string;
      shares: number;
      costBasis: number;
      currentValue: number;
      unrealizedLoss: number;
      lossPct: number;
      replacementFunds: string[];
    }[] = [];

    let totalHarvestable = 0;

    let skippedNoBasis = 0;

    for (const h of scannable) {
      const shares = Number(h.shares);
      /**
       * No basis, no knowable loss.
       *
       * `Number(h.costBasisPerShare)` turned an unreported basis into a cost
       * of zero, which made every such position a large unrealised GAIN —
       * so they were silently excluded from harvesting rather than flagged
       * as unmeasurable. Both the old outcome and the reason for it were
       * invisible; the count now comes back with the result.
       */
      const costBasis = positionBasis(h);
      if (costBasis === null) {
        skippedNoBasis++;
        continue;
      }
      const currentValue = Number(h.currentValue);
      const unrealizedLoss = currentValue - costBasis;

      if (unrealizedLoss >= 0 || Math.abs(unrealizedLoss) < minimumLoss) {
        continue;
      }

      const replacements =
        REPLACEMENT_MAP[h.ticker] ||
        Object.entries(REPLACEMENT_MAP).find(([, alts]) =>
          alts.includes(h.ticker)
        )?.[1]?.filter((t) => t !== h.ticker) ||
        [];

      totalHarvestable += Math.abs(unrealizedLoss);

      candidates.push({
        ticker: h.ticker,
        name: h.name,
        assetClass: ASSET_CLASS_LABELS[h.assetClass] || h.assetClass,
        account: h.accountName,
        owner: h.accountOwner === "spouse" ? "Spouse" : "Self",
        shares,
        costBasis: Math.round(costBasis * 100) / 100,
        currentValue: Math.round(currentValue * 100) / 100,
        unrealizedLoss: Math.round(unrealizedLoss * 100) / 100,
        lossPct:
          Math.round(
            (unrealizedLoss / (costBasis || 1)) * 10000
          ) / 100,
        replacementFunds: replacements,
      });
    }

    // Sort by largest loss first
    candidates.sort((a, b) => a.unrealizedLoss - b.unrealizedLoss);

    const estimatedTaxSavings = Math.round(totalHarvestable * 0.24 * 100) / 100;

    return {
      candidates,
      totalHarvestable: Math.round(totalHarvestable * 100) / 100,
      estimatedTaxSavings,
      summary:
        candidates.length === 0
          ? `No tax-loss harvesting opportunities found above $${minimumLoss} in taxable accounts.`
          : `${candidates.length} TLH candidates found with $${Math.round(totalHarvestable).toLocaleString()} in harvestable losses. Estimated tax savings: ~$${Math.round(estimatedTaxSavings).toLocaleString()} (at 24% marginal rate).`,
      washSaleWarning:
        "Remember the wash sale rule: you cannot buy a 'substantially identical' security within 30 days before or after the sale. Use the suggested replacement funds to maintain your market exposure.",
    };
  },
});
