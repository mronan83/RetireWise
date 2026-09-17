import { tool } from "ai";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { getHoldingsByClerkId } from "../queries/holdings";
import { getSnapshots } from "../queries/snapshots";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const YahooFinance = require("yahoo-finance2").default;
const yahooFinance = typeof YahooFinance === "function" ? new YahooFinance() : YahooFinance;

export const compareBenchmarksTool = tool({
  description:
    "Compare the household portfolio performance against major benchmarks (S&P 500, Total US Market, Total International, Total Bond). Shows portfolio return vs benchmark returns over various time periods.",
  inputSchema: z.object({
    period: z
      .enum(["1m", "3m", "6m", "1y", "ytd"])
      .optional()
      .describe("Time period for comparison. Default: ytd"),
  }),
  execute: async ({ period = "ytd" }) => {
    const { userId } = await auth();
    if (!userId) return { error: "Not authenticated" };

    const holdings = await getHoldingsByClerkId(userId);
    const totalValue = holdings.reduce(
      (sum, h) => sum + Number(h.currentValue),
      0
    );
    const totalCostBasis = holdings.reduce(
      (sum, h) => sum + Number(h.shares) * Number(h.costBasisPerShare),
      0
    );

    // Portfolio return
    const portfolioReturn =
      totalCostBasis > 0
        ? ((totalValue - totalCostBasis) / totalCostBasis) * 100
        : 0;

    // Fetch benchmark performance
    const benchmarks = [
      { ticker: "VOO", name: "S&P 500", proxy: "Vanguard S&P 500 ETF" },
      {
        ticker: "VTI",
        name: "US Total Market",
        proxy: "Vanguard Total Stock Market ETF",
      },
      {
        ticker: "VXUS",
        name: "International",
        proxy: "Vanguard Total International ETF",
      },
      {
        ticker: "BND",
        name: "US Bonds",
        proxy: "Vanguard Total Bond Market ETF",
      },
    ];

    const now = new Date();
    let startDate: Date;
    switch (period) {
      case "1m":
        startDate = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
        break;
      case "3m":
        startDate = new Date(now.getFullYear(), now.getMonth() - 3, now.getDate());
        break;
      case "6m":
        startDate = new Date(now.getFullYear(), now.getMonth() - 6, now.getDate());
        break;
      case "1y":
        startDate = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
        break;
      case "ytd":
      default:
        startDate = new Date(now.getFullYear(), 0, 1);
        break;
    }

    const benchmarkResults: {
      name: string;
      ticker: string;
      periodReturn: number | null;
      currentPrice: number | null;
    }[] = [];

    for (const bm of benchmarks) {
      try {
        const history = (await yahooFinance.historical(bm.ticker, {
          period1: startDate,
          period2: now,
          interval: "1d",
        })) as { close: number; date: Date }[];

        if (history.length >= 2) {
          const startPrice = history[0].close;
          const endPrice = history[history.length - 1].close;
          const returnPct = ((endPrice - startPrice) / startPrice) * 100;

          benchmarkResults.push({
            name: bm.name,
            ticker: bm.ticker,
            periodReturn: Math.round(returnPct * 100) / 100,
            currentPrice: Math.round(endPrice * 100) / 100,
          });
        }
      } catch {
        benchmarkResults.push({
          name: bm.name,
          ticker: bm.ticker,
          periodReturn: null,
          currentPrice: null,
        });
      }
    }

    // Get snapshots for portfolio time-series comparison
    const snapshots = await getSnapshots(userId, 365);
    const relevantSnapshots = snapshots.filter(
      (s) => new Date(s.snapshotDate) >= startDate
    );

    let portfolioPeriodReturn: number | null = null;
    if (relevantSnapshots.length >= 2) {
      const oldest = relevantSnapshots[relevantSnapshots.length - 1];
      const newest = relevantSnapshots[0];
      const startVal = Number(oldest.totalValue);
      const endVal = Number(newest.totalValue);
      if (startVal > 0) {
        portfolioPeriodReturn =
          Math.round(((endVal - startVal) / startVal) * 10000) / 100;
      }
    }

    return {
      period,
      portfolioValue: Math.round(totalValue * 100) / 100,
      portfolioTotalReturn: Math.round(portfolioReturn * 100) / 100,
      portfolioPeriodReturn,
      benchmarks: benchmarkResults,
      note:
        portfolioPeriodReturn === null
          ? "Portfolio period return requires daily snapshot history. Check back after a few days of snapshots accumulate."
          : undefined,
    };
  },
});
