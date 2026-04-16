"use client";

import { useState } from "react";
import { Play, TrendingDown, Clock, PiggyBank, Percent } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/utils/format";
import {
  calculateProjection,
  runMonteCarlo,
  type ProjectionInput,
} from "@/lib/utils/projections";
import { cn } from "@/lib/utils";

const SCENARIOS = [
  {
    id: "market_crash",
    name: "Market Crash (-30%)",
    icon: TrendingDown,
    description: "What if the market drops 30% tomorrow?",
    modify: (input: ProjectionInput) => ({
      ...input,
      currentPortfolioValue: input.currentPortfolioValue * 0.7,
    }),
  },
  {
    id: "early_retire",
    name: "Retire 5 Years Early",
    icon: Clock,
    description: "What if you retire at " ,
    modify: (input: ProjectionInput) => ({
      ...input,
      yearsToRetirement: Math.max(0, input.yearsToRetirement - 5),
      yearsInRetirement: input.yearsInRetirement + 5,
    }),
  },
  {
    id: "boost_savings",
    name: "Boost Savings 50%",
    icon: PiggyBank,
    description: "What if you increase contributions by 50%?",
    modify: (input: ProjectionInput) => ({
      ...input,
      annualContributions: input.annualContributions * 1.5,
    }),
  },
  {
    id: "lower_returns",
    name: "Lower Returns (4%)",
    icon: Percent,
    description: "What if average returns are only 4%?",
    modify: (input: ProjectionInput) => ({
      ...input,
      expectedReturnPct: 4,
    }),
  },
  {
    id: "high_inflation",
    name: "High Inflation (5%)",
    icon: Percent,
    description: "What if inflation stays elevated at 5%?",
    modify: (input: ProjectionInput) => ({
      ...input,
      inflationPct: 5,
    }),
  },
  {
    id: "no_ss",
    name: "No Social Security",
    icon: TrendingDown,
    description: "What if Social Security benefits are cut?",
    modify: (input: ProjectionInput) => ({
      ...input,
      socialSecurityMonthlyIncome: 0,
    }),
  },
];

type ScenarioResult = {
  id: string;
  name: string;
  portfolioAtRetirement: number;
  successRate: number;
  canSustain: boolean;
  monthlyIncome: number;
};

type Props = {
  baseInput: ProjectionInput;
  currentAge: number;
  retirementAge: number;
};

export function ScenarioRunner({ baseInput, currentAge, retirementAge }: Props) {
  const [results, setResults] = useState<ScenarioResult[] | null>(null);
  const [running, setRunning] = useState(false);

  const runAll = () => {
    setRunning(true);

    // Run base case
    const baseProjection = calculateProjection(baseInput, currentAge);
    const baseMC = runMonteCarlo(baseInput, currentAge, 500);

    const allResults: ScenarioResult[] = [
      {
        id: "base",
        name: "Base Case",
        portfolioAtRetirement: baseProjection.portfolioAtRetirement,
        successRate: baseMC.successRate,
        canSustain: baseProjection.canSustainRetirement,
        monthlyIncome: baseProjection.totalMonthlyRetirementIncome,
      },
    ];

    // Run each scenario
    for (const scenario of SCENARIOS) {
      const modifiedInput = scenario.modify(baseInput);
      const proj = calculateProjection(modifiedInput, currentAge);
      const mc = runMonteCarlo(modifiedInput, currentAge, 500);

      allResults.push({
        id: scenario.id,
        name: scenario.name,
        portfolioAtRetirement: proj.portfolioAtRetirement,
        successRate: mc.successRate,
        canSustain: proj.canSustainRetirement,
        monthlyIncome: proj.totalMonthlyRetirementIncome,
      });
    }

    setResults(allResults);
    setRunning(false);
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Scenario Analysis</CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              &quot;What if&quot; modeling — see how different scenarios affect your
              retirement
            </p>
          </div>
          <Button onClick={runAll} disabled={running}>
            <Play className="mr-2 h-4 w-4" />
            {running ? "Running..." : "Run All Scenarios"}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {!results ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {SCENARIOS.map((s) => (
              <div
                key={s.id}
                className="rounded-lg border p-4 text-sm"
              >
                <div className="flex items-center gap-2">
                  <s.icon className="h-4 w-4 text-primary" />
                  <span className="font-medium">{s.name}</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {s.description}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-2">
            {results.map((r) => {
              const isBase = r.id === "base";
              const baseResult = results[0];
              const diff = r.portfolioAtRetirement - baseResult.portfolioAtRetirement;
              const diffPct =
                baseResult.portfolioAtRetirement > 0
                  ? (diff / baseResult.portfolioAtRetirement) * 100
                  : 0;

              return (
                <div
                  key={r.id}
                  className={cn(
                    "flex items-center justify-between rounded-lg border p-3",
                    isBase ? "bg-muted/30 border-primary/30" : ""
                  )}
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">{r.name}</span>
                      {isBase && (
                        <Badge variant="secondary" className="text-xs">
                          Current Plan
                        </Badge>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-6 text-sm">
                    <div className="text-right">
                      <p className="text-xs text-muted-foreground">
                        At Retirement
                      </p>
                      <p className="font-mono font-medium">
                        {formatCurrency(r.portfolioAtRetirement)}
                      </p>
                      {!isBase && (
                        <p
                          className={cn(
                            "text-xs font-mono",
                            diff >= 0 ? "text-green-500" : "text-red-500"
                          )}
                        >
                          {diff >= 0 ? "+" : ""}
                          {formatCurrency(diff)} ({diffPct >= 0 ? "+" : ""}
                          {Math.round(diffPct)}%)
                        </p>
                      )}
                    </div>
                    <div className="text-right min-w-[60px]">
                      <p className="text-xs text-muted-foreground">
                        Success
                      </p>
                      <p
                        className={cn(
                          "font-mono font-medium",
                          r.successRate >= 80
                            ? "text-green-500"
                            : r.successRate >= 60
                              ? "text-yellow-500"
                              : "text-red-500"
                        )}
                      >
                        {r.successRate}%
                      </p>
                    </div>
                    <div className="text-right min-w-[80px]">
                      <p className="text-xs text-muted-foreground">
                        Monthly Income
                      </p>
                      <p className="font-mono font-medium">
                        {formatCurrency(r.monthlyIncome)}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
