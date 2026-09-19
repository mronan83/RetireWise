import { streamText, stepCountIs, convertToModelMessages } from "ai";
import { getApiUserId } from "@/lib/auth-helpers";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { userPreferences } from "@/lib/db/schema";
import { getModel } from "@/lib/ai/model";
import { decrypt } from "@/lib/utils/encryption";
import { getPortfolioSummaryTool } from "@/lib/tools/get-portfolio-summary";
import { getHoldingsDetailTool } from "@/lib/tools/get-holdings-detail";
import { calculateAllocationDriftTool } from "@/lib/tools/calculate-allocation-drift";
import { getHouseholdSummaryTool } from "@/lib/tools/get-household-summary";
import { generateRebalancingTradesTool } from "@/lib/tools/generate-rebalancing-trades";
import { scanTaxLossHarvestingTool } from "@/lib/tools/scan-tax-loss-harvesting";
import { getDividendIncomeTool } from "@/lib/tools/get-dividend-income";
import { compareBenchmarksTool } from "@/lib/tools/compare-benchmarks";
import { runRetirementProjectionTool } from "@/lib/tools/run-retirement-projection";
import { getNetWorthTool } from "@/lib/tools/get-net-worth";
import { runFinancialAnalyticsTool } from "@/lib/tools/run-financial-analytics";
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
- Run advanced financial analytics via runFinancialAnalytics tool:
  * "rmd" — Required Minimum Distribution projections from age 73
  * "tax" — Retirement income tax projections with MFJ brackets
  * "roth_conversion" — Roth conversion ladder to reduce RMDs and lifetime taxes
  * "ss_break_even" — Social Security break-even analysis for each claiming age
  * "catch_up" — Impact of catch-up contributions at 50+ and 60-63
  * "income_replacement" — Income replacement ratio vs pre-retirement income
  * "fee_impact" — Fund expense ratio analysis and 30-year fee drag
  * "sequence_risk" — Sequence of returns risk with historical scenarios
  * "healthcare" — Healthcare cost projections with inflation
  * "all_summary" — Quick summary of all analytics

Key household considerations:
- Accounts are tagged as "self" or "spouse" — always distinguish who owns what
- Tax-loss harvesting only applies to taxable brokerage accounts, NOT 401(k)s or IRAs
- Rebalancing in tax-advantaged accounts avoids capital gains taxes
- Consider the wash sale rule (30 days) when suggesting TLH trades
- RMDs and Roth conversions apply per-person based on tax-deferred account balances
- Healthcare costs differ significantly pre-Medicare (before 65) vs Medicare

Guidelines:
- Always use the available tools to get current data before making recommendations
- Use runFinancialAnalytics for tax planning, RMD, Roth conversion, and healthcare questions
- Present numbers clearly with dollar amounts and percentages
- Be specific — name tickers, dollar amounts, and which accounts to trade in
- When showing rebalancing trades, indicate whether to execute in tax-advantaged or taxable accounts
- When discussing Roth conversions, explain the tax cost now vs tax savings later
- Be conversational but professional

Important: ${AI_DISCLAIMER}`;

export async function POST(request: Request) {
  const userId = await getApiUserId();
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
    .select({
      aiProvider: userPreferences.aiProvider,
      anthropicModel: userPreferences.anthropicModel,
      anthropicApiKey: userPreferences.anthropicApiKey,
      googleApiKey: userPreferences.googleApiKey,
      openaiApiKey: userPreferences.openaiApiKey,
    })
    .from(userPreferences)
    .where(eq(userPreferences.clerkId, userId))
    .limit(1);

  const provider = prefs[0]?.aiProvider || undefined;

  // Resolve user's API key for the selected provider
  let userApiKey: string | undefined;
  if (prefs[0]) {
    const keyMap: Record<string, string | null> = {
      anthropic: prefs[0].anthropicApiKey,
      google: prefs[0].googleApiKey,
      openai: prefs[0].openaiApiKey,
    };
    const encrypted = keyMap[provider || "anthropic"];
    if (encrypted) {
      try { userApiKey = decrypt(encrypted); } catch { /* fall back to env var */ }
    }
  }

  const { messages } = await request.json();

  const result = streamText({
    model: getModel(provider || undefined, userApiKey, prefs[0]?.anthropicModel),
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
      runRetirementProjection: runRetirementProjectionTool,
      getNetWorth: getNetWorthTool,
      runFinancialAnalytics: runFinancialAnalyticsTool,
    },
    stopWhen: stepCountIs(10),
  });

  return result.toUIMessageStreamResponse();
}
