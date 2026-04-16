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
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  },
  {
    icon: Target,
    title: "Allocation Drift",
    description: "Are we on target?",
    detail:
      "Compare your current allocation against your targets and get specific rebalancing suggestions.",
    prompt:
      "Analyze our allocation drift. Compare our current portfolio allocation against our target allocation and tell us what's over or underweight. Give specific rebalancing suggestions.",
  },
  {
    icon: BarChart3,
    title: "Holdings Analysis",
    description: "Deep dive into positions",
    detail:
      "Concentration risk, best and worst performers, and opportunities across all holdings.",
    prompt:
      "Analyze our holdings in detail. Show our top positions by value, identify concentration risk, and highlight our best and worst performers. Sort by gain/loss.",
  },
  {
    icon: DollarSign,
    title: "Tax Strategy",
    description: "Optimize your tax situation",
    detail:
      "Tax-loss harvesting opportunities and asset location recommendations across account types.",
    prompt:
      "Review our portfolio for tax optimization opportunities. Look for tax-loss harvesting candidates, check if our asset location is efficient across our tax-deferred, tax-free, and taxable accounts, and suggest improvements.",
  },
  {
    icon: Users,
    title: "Household Summary",
    description: "Combined retirement picture",
    detail:
      "Both spouses' retirement timelines, Social Security, contributions, and how it all adds up.",
    prompt:
      "Give me a complete household retirement summary. Show our combined portfolio, each person's accounts, our Social Security details, contribution rates, and how we're tracking toward retirement.",
  },
  {
    icon: Shield,
    title: "Risk Assessment",
    description: "How vulnerable are we?",
    detail:
      "Sector concentration, correlation analysis, and how your portfolio might behave in a downturn.",
    prompt:
      "Assess the risk in our portfolio. Look at sector concentration, how correlated our holdings are, and estimate how our portfolio might perform in a market downturn of 20-30%.",
  },
  {
    icon: TrendingUp,
    title: "Retirement Readiness",
    description: "Are we on track?",
    detail:
      "Based on your portfolio, savings rate, and Social Security, are you on track to retire when you want?",
    prompt:
      "Based on our current portfolio value, savings rate, Social Security estimates, and retirement goals, are we on track to retire when we want? What's our projected monthly income in retirement vs our expected expenses?",
  },
  {
    icon: MessageSquare,
    title: "Ask Anything",
    description: "Custom question",
    detail:
      "Ask any question about your investments, retirement planning, tax strategies, or financial goals.",
    prompt: "",
  },
];

export default function AnalysisPage() {
  const handleClick = (prompt: string) => {
    if (prompt) {
      triggerChat(prompt);
    } else {
      // "Ask Anything" — just open the chat
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

      <div className="grid gap-4 sm:grid-cols-2">
        {analysisOptions.map((option) => (
          <Card
            key={option.title}
            className="cursor-pointer transition-colors hover:bg-accent/50 active:scale-[0.99]"
            onClick={() => handleClick(option.prompt)}
          >
            <CardHeader className="flex flex-row items-center gap-3 pb-2">
              <option.icon className="h-7 w-7 shrink-0 text-primary" />
              <div>
                <CardTitle className="text-base">{option.title}</CardTitle>
                <p className="text-sm text-muted-foreground">
                  {option.description}
                </p>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">{option.detail}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
