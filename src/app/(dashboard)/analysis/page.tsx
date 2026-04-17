"use client";

import {
  Brain,
  MessageSquare,
  BarChart3,
  Target,
  TrendingUp,
  Shield,
  DollarSign,
  Users,
  ArrowRightLeft,
  Scissors,
  LineChart,
  Coins,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { triggerChat } from "@/lib/utils/chat-events";

const analysisOptions = [
  {
    icon: Brain,
    title: "Portfolio Review",
    description: "Full health check of your household portfolio",
    detail:
      "Allocation, diversification, risk exposure, and performance across both your and your spouse's accounts.",
    prompt:
      "Give me a comprehensive review of our household portfolio. Analyze our allocation, diversification, risk exposure, and overall performance. Include both my accounts and my spouse's.",
    badge: null,
  },
  {
    icon: ArrowRightLeft,
    title: "Rebalancing Trades",
    description: "Specific buy/sell recommendations",
    detail:
      "Generate exact trades to return to target allocation. Shows dollar amounts, which tickers, and which accounts to trade in.",
    prompt:
      "Generate specific rebalancing trade recommendations for our portfolio. Show me exactly what to buy and sell, the dollar amounts, and which accounts to make the trades in. Consider tax implications.",
    badge: "Phase 2",
  },
  {
    icon: Scissors,
    title: "Tax-Loss Harvesting",
    description: "Find losses to offset gains",
    detail:
      "Scan taxable accounts for unrealized losses. Get replacement fund suggestions to maintain exposure while harvesting losses.",
    prompt:
      "Scan our taxable accounts for tax-loss harvesting opportunities. Show me which holdings have unrealized losses, how much we could harvest, estimated tax savings, and suggest replacement funds that maintain our market exposure.",
    badge: "Phase 2",
  },
  {
    icon: LineChart,
    title: "Benchmark Comparison",
    description: "How do we stack up?",
    detail:
      "Compare your portfolio performance against the S&P 500, total US market, international, and bond benchmarks.",
    prompt:
      "Compare our portfolio performance against major benchmarks — S&P 500, total US market, international stocks, and bonds. Show returns for year-to-date and explain how we're doing relative to the market.",
    badge: "Phase 2",
  },
  {
    icon: Coins,
    title: "Dividend Income",
    description: "Passive income projections",
    detail:
      "Estimate annual dividend income per holding, monthly passive income, and breakdown by asset class.",
    prompt:
      "Estimate our household dividend income. Show total annual dividends, monthly income, our top dividend-paying holdings, and a breakdown by asset class. Include both my and my spouse's accounts.",
    badge: "Phase 2",
  },
  {
    icon: Target,
    title: "Allocation Drift",
    description: "Are we on target?",
    detail:
      "Compare your current allocation against your targets and get specific rebalancing suggestions.",
    prompt:
      "Analyze our allocation drift. Compare our current portfolio allocation against our target allocation and tell us what's over or underweight. Give specific rebalancing suggestions.",
    badge: null,
  },
  {
    icon: DollarSign,
    title: "Tax Strategy",
    description: "Optimize your tax situation",
    detail:
      "Asset location analysis across account types. Are the right assets in the right accounts?",
    prompt:
      "Review our portfolio for tax optimization. Check if our asset location is efficient — are bonds in tax-deferred accounts? Growth stocks in Roth? Suggest improvements for tax-efficient placement across our account types.",
    badge: null,
  },
  {
    icon: Users,
    title: "Household Summary",
    description: "Combined retirement picture",
    detail:
      "Both spouses' retirement timelines, Social Security, contributions, and how it all adds up.",
    prompt:
      "Give me a complete household retirement summary. Show our combined portfolio, each person's accounts, our Social Security details, contribution rates, and how we're tracking toward retirement.",
    badge: null,
  },
  {
    icon: Shield,
    title: "Risk Assessment",
    description: "How vulnerable are we?",
    detail:
      "Sector concentration, correlation analysis, and how your portfolio might behave in a downturn.",
    prompt:
      "Assess the risk in our portfolio. Look at sector concentration, how correlated our holdings are, and estimate how our portfolio might perform in a market downturn of 20-30%.",
    badge: null,
  },
  {
    icon: TrendingUp,
    title: "Retirement Readiness",
    description: "Are we on track?",
    detail:
      "Based on your portfolio, savings rate, and Social Security, are you on track to retire when you want?",
    prompt:
      "Based on our current portfolio value, savings rate, Social Security estimates, and retirement goals, are we on track to retire when we want? What's our projected monthly income in retirement vs our expected expenses?",
    badge: null,
  },
  {
    icon: DollarSign,
    title: "RMD & Roth Conversion",
    description: "Tax-efficient withdrawal planning",
    detail:
      "Project your Required Minimum Distributions and find the optimal Roth conversion strategy to reduce lifetime taxes.",
    prompt:
      "Run the RMD projection and Roth conversion ladder analysis for our household. Show how much we should convert each year between retirement and age 73 to minimize lifetime taxes. What are our projected RMDs without conversions vs with the conversion strategy?",
    badge: "Analytics",
  },
  {
    icon: Shield,
    title: "Fee & Sequence Risk",
    description: "Hidden costs and timing risk",
    detail:
      "Analyze fund expense ratios eating your returns and how market timing at retirement impacts your portfolio survival.",
    prompt:
      "Run the fee impact analysis on our portfolio — what are we paying in expense ratios and what's the 30-year drag? Also run the sequence of returns risk analysis to show how a bear market in our first years of retirement would affect us vs a bull market start.",
    badge: "Analytics",
  },
  {
    icon: Users,
    title: "Healthcare & Income",
    description: "Healthcare costs + income replacement",
    detail:
      "Project healthcare costs through retirement and check if our income replacement ratio meets the 80% target.",
    prompt:
      "Run the healthcare cost projection for our retirement — how much should we budget for pre-Medicare and Medicare costs? Also check our income replacement ratio — will our retirement income cover 80% of our current earnings?",
    badge: "Analytics",
  },
  {
    icon: MessageSquare,
    title: "Ask Anything",
    description: "Custom question",
    detail:
      "Ask any question about your investments, retirement planning, tax strategies, or financial goals.",
    prompt: "",
    badge: null,
  },
];

export default function AnalysisPage() {
  const handleClick = (prompt: string) => {
    if (prompt) {
      triggerChat(prompt);
    } else {
      triggerChat("");
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">AI Analysis</h1>
        <p className="text-muted-foreground">
          Click any card to run that analysis on your portfolio
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {analysisOptions.map((option) => (
          <Card
            key={option.title}
            className="cursor-pointer transition-colors hover:bg-accent/50 active:scale-[0.99]"
            onClick={() => handleClick(option.prompt)}
          >
            <CardHeader className="flex flex-row items-start gap-3 pb-2">
              <option.icon className="mt-0.5 h-6 w-6 shrink-0 text-primary" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <CardTitle className="text-sm">{option.title}</CardTitle>
                  {option.badge && (
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                      {option.badge}
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {option.description}
                </p>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">{option.detail}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
