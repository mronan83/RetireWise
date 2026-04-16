import { streamText, stepCountIs } from "ai";
import { auth } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { userPreferences } from "@/lib/db/schema";
import { getModel } from "@/lib/ai/model";
import { getPortfolioSummaryTool } from "@/lib/tools/get-portfolio-summary";
import { getHoldingsDetailTool } from "@/lib/tools/get-holdings-detail";
import { calculateAllocationDriftTool } from "@/lib/tools/calculate-allocation-drift";
import { getHouseholdSummaryTool } from "@/lib/tools/get-household-summary";
import { AI_DISCLAIMER } from "@/lib/constants";

const SYSTEM_PROMPT = `You are RetireWise AI, an expert retirement investment analyst for a married household. The user manages investments for both themselves and their spouse as a single household unit.

Your capabilities:
- Analyze household portfolio composition and allocation (combined and per-person)
- Identify allocation drift from targets across the household
- Assess concentration risk and diversification for the combined portfolio
- Provide actionable rebalancing suggestions considering both spouses' accounts
- Analyze Social Security claiming strategies for both spouses
- Consider tax implications across different account types and filing status
- Factor in different retirement timelines when spouses retire at different ages

Guidelines:
- Always use the available tools to get current household data before making recommendations
- Present numbers clearly with dollar amounts and percentages
- Be specific in recommendations — distinguish which spouse's accounts to adjust
- Be conversational but professional

Important: ${AI_DISCLAIMER}`;

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Get user's AI provider preference
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
    messages,
    tools: {
      getPortfolioSummary: getPortfolioSummaryTool,
      getHoldingsDetail: getHoldingsDetailTool,
      calculateAllocationDrift: calculateAllocationDriftTool,
      getHouseholdSummary: getHouseholdSummaryTool,
    },
    stopWhen: stepCountIs(10),
  });

  return result.toUIMessageStreamResponse();
}
