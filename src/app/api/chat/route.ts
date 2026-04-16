import { streamText, stepCountIs, convertToModelMessages } from "ai";
import { auth } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { userPreferences } from "@/lib/db/schema";
import { getModel } from "@/lib/ai/model";
import { getPortfolioSummaryTool } from "@/lib/tools/get-portfolio-summary";
import { getHoldingsDetailTool } from "@/lib/tools/get-holdings-detail";
import { calculateAllocationDriftTool } from "@/lib/tools/calculate-allocation-drift";
import { getHouseholdSummaryTool } from "@/lib/tools/get-household-summary";
import { generateRebalancingTradesTool } from "@/lib/tools/generate-rebalancing-trades";
import { scanTaxLossHarvestingTool } from "@/lib/tools/scan-tax-loss-harvesting";
import { getDividendIncomeTool } from "@/lib/tools/get-dividend-income";
import { compareBenchmarksTool } from "@/lib/tools/compare-benchmarks";
import { AI_DISCLAIMER } from "@/lib/constants";
import { getChatRateLimiter } from "@/lib/redis";

const SYSTEM_PROMPT = `You are RetireWise AI, an expert retirement investment analyst for a married household. The user manages investments for both themselves and their spouse as a single household unit.

Your capabilities:
- Analyze household portfolio composition and allocation (combined and per-person)
- Identify allocation drift and generate specific rebalancing trade recommendations
- Assess concentration risk and diversification for the combined portfolio
- Scan taxable accounts for tax-loss harvesting opportunities with replacement fund suggestions
- Compare portfolio performance against benchmarks (S&P 500, total market, bonds, international)
- Estimate dividend income and project annual/monthly passive income
- Analyze Social Security claiming strategies for both spouses
- Consider tax implications across different account types and filing status (married filing jointly)
- Factor in different retirement timelines when spouses retire at different ages

Key household considerations:
- Accounts are tagged as "self" or "spouse" — always distinguish who owns what
- Tax-loss harvesting only applies to taxable brokerage accounts, NOT 401(k)s or IRAs
- Rebalancing in tax-advantaged accounts avoids capital gains taxes
- Consider the wash sale rule (30 days) when suggesting TLH trades

Guidelines:
- Always use the available tools to get current data before making recommendations
- Present numbers clearly with dollar amounts and percentages
- Be specific — name tickers, dollar amounts, and which accounts to trade in
- When showing rebalancing trades, indicate whether to execute in tax-advantaged or taxable accounts
- Be conversational but professional

Important: ${AI_DISCLAIMER}`;

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Rate limiting (if Redis is configured)
  const rateLimiter = getChatRateLimiter();
  if (rateLimiter) {
    const { success } = await rateLimiter.limit(userId);
    if (!success) {
      return Response.json(
        { error: "Too many requests. Please wait a moment." },
        { status: 429 }
      );
    }
  }

  const db = getDb();
  const prefs = await db
    .select({ aiProvider: userPreferences.aiProvider })
    .from(userPreferences)
    .where(eq(userPreferences.clerkId, userId))
    .limit(1);

  const provider = prefs[0]?.aiProvider || undefined;

  const { messages } = await request.json();

  const result = streamText({
    model: getModel(provider || undefined),
    system: SYSTEM_PROMPT,
    messages: await convertToModelMessages(messages),
    tools: {
      getPortfolioSummary: getPortfolioSummaryTool,
      getHoldingsDetail: getHoldingsDetailTool,
      calculateAllocationDrift: calculateAllocationDriftTool,
      getHouseholdSummary: getHouseholdSummaryTool,
      generateRebalancingTrades: generateRebalancingTradesTool,
      scanTaxLossHarvesting: scanTaxLossHarvestingTool,
      getDividendIncome: getDividendIncomeTool,
      compareBenchmarks: compareBenchmarksTool,
    },
    stopWhen: stepCountIs(10),
  });

  return result.toUIMessageStreamResponse();
}
