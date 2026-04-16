import { tool } from "ai";
import { z } from "zod";
import { auth } from "@clerk/nextjs/server";
import { getHoldingsByClerkId } from "../queries/holdings";
import { ASSET_CLASS_LABELS } from "../constants";

// Approximate dividend yields for common funds/ETFs (as of typical values)
// In production, these would come from Yahoo Finance API
const APPROXIMATE_YIELDS: Record<string, number> = {
  // US Total Market
  VTI: 1.3, FSKAX: 1.3, ITOT: 1.3, SCHB: 1.3, SPTM: 1.3,
  // S&P 500
  VOO: 1.3, FXAIX: 1.3, IVV: 1.3, SPY: 1.3, SPLG: 1.3,
  // Growth (lower yield)
  QQQ: 0.6, VUG: 0.5, SCHG: 0.5, MGK: 0.5,
  // Value (higher yield)
  VTV: 2.3, SCHV: 2.3, VLUE: 2.5,
  // International
  VXUS: 3.0, IXUS: 2.8, FZILX: 2.5, VEA: 3.1, VWO: 3.2,
  FTIHX: 2.8, FSPSX: 2.9,
  // Bonds
  BND: 3.5, AGG: 3.4, VBTLX: 3.5, FXNAX: 3.3, SCHZ: 3.4,
  TLT: 3.8, IEF: 3.2, SHY: 4.0, TIPS: 2.5,
  // REITs (higher yield)
  VNQ: 3.8, VGSLX: 3.8, IYR: 3.5, SCHH: 3.2,
  // High Dividend
  VYM: 2.8, SCHD: 3.4, HDV: 3.5, DVY: 3.6, VHYAX: 2.9,
  // Money Market
  SPAXX: 4.5, FDRXX: 4.5, VMFXX: 4.5, SWVXX: 4.5, FMPXX: 4.5,
};

// Default yield by asset class when ticker not found
const DEFAULT_YIELDS: Record<string, number> = {
  us_stock: 1.5,
  intl_stock: 2.8,
  bond: 3.5,
  reit: 3.5,
  commodity: 0,
  crypto: 0,
  cash: 4.5,
  other: 1.0,
};

export const getDividendIncomeTool = tool({
  description:
    "Estimate annual dividend income for the household portfolio. Shows per-holding dividend estimates, total annual income, and monthly income projection.",
  inputSchema: z.object({}),
  execute: async () => {
    const { userId } = await auth();
    if (!userId) return { error: "Not authenticated" };

    const holdings = await getHoldingsByClerkId(userId);

    let totalAnnualDividends = 0;
    let selfDividends = 0;
    let spouseDividends = 0;

    const holdingDividends: {
      ticker: string;
      name: string;
      value: number;
      estimatedYield: number;
      annualDividend: number;
      quarterlyDividend: number;
      account: string;
      owner: string;
    }[] = [];

    for (const h of holdings) {
      const value = Number(h.currentValue);
      const yieldPct =
        APPROXIMATE_YIELDS[h.ticker] ||
        DEFAULT_YIELDS[h.assetClass] ||
        1.0;
      const annualDiv = value * (yieldPct / 100);
      const quarterlyDiv = annualDiv / 4;

      totalAnnualDividends += annualDiv;
      if (h.accountOwner === "spouse") {
        spouseDividends += annualDiv;
      } else {
        selfDividends += annualDiv;
      }

      holdingDividends.push({
        ticker: h.ticker,
        name: h.name,
        value: Math.round(value * 100) / 100,
        estimatedYield: yieldPct,
        annualDividend: Math.round(annualDiv * 100) / 100,
        quarterlyDividend: Math.round(quarterlyDiv * 100) / 100,
        account: h.accountName,
        owner: h.accountOwner === "spouse" ? "Spouse" : "Self",
      });
    }

    // Sort by annual dividend (biggest payers first)
    holdingDividends.sort((a, b) => b.annualDividend - a.annualDividend);

    // Breakdown by asset class
    const byAssetClass: Record<string, number> = {};
    for (const h of holdings) {
      const yieldPct =
        APPROXIMATE_YIELDS[h.ticker] ||
        DEFAULT_YIELDS[h.assetClass] ||
        1.0;
      const label = ASSET_CLASS_LABELS[h.assetClass] || h.assetClass;
      byAssetClass[label] =
        (byAssetClass[label] || 0) +
        Number(h.currentValue) * (yieldPct / 100);
    }

    for (const key of Object.keys(byAssetClass)) {
      byAssetClass[key] = Math.round(byAssetClass[key] * 100) / 100;
    }

    return {
      totalAnnualDividends: Math.round(totalAnnualDividends * 100) / 100,
      monthlyDividendIncome:
        Math.round((totalAnnualDividends / 12) * 100) / 100,
      selfAnnualDividends: Math.round(selfDividends * 100) / 100,
      spouseAnnualDividends: Math.round(spouseDividends * 100) / 100,
      byAssetClass,
      topDividendPayers: holdingDividends.slice(0, 10),
      allHoldings: holdingDividends,
      note: "Yields are estimates based on recent distribution rates. Actual dividends may vary. Money market yields fluctuate with interest rates.",
    };
  },
});
