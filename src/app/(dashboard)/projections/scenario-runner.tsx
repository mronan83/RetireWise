"use client";

import { useState } from "react";
import {
  Play,
  TrendingDown,
  Clock,
  PiggyBank,
  Percent,
  PlayCircle,
  RotateCcw,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils/format";
import {
  calculateProjection,
  runMonteCarlo,
  type ProjectionInput,
} from "@/lib/utils/projections";
import { cn } from "@/lib/utils";

type ScenarioConfig = {
  id: string;
  name: string;
  icon: LucideIcon;
  description: string;
  paramLabel: string;
  defaultValue: number;
  unit: string;
  modify: (input: ProjectionInput, value: number) => ProjectionInput;
};

const SCENARIOS: ScenarioConfig[] = [
  {
    id: "market_crash",
    name: "Market Crash",
    icon: TrendingDown,
    description: "What if the market drops suddenly?",
    paramLabel: "Drop",
    defaultValue: 30,
    unit: "%",
    modify: (input, value) => ({
      ...input,
      currentPortfolioValue: input.currentPortfolioValue * (1 - value / 100),
    }),
  },
  {
    id: "early_retire",
    name: "Retire Earlier",
    icon: Clock,
    description: "What if you retire sooner?",
    paramLabel: "Years earlier",
    defaultValue: 5,
    unit: "yrs",
    modify: (input, value) => ({
      ...input,
      yearsToRetirement: Math.max(0, input.yearsToRetirement - value),
      yearsInRetirement: input.yearsInRetirement + value,
    }),
  },
  {
    id: "boost_savings",
    name: "Boost Savings",
    icon: PiggyBank,
    description: "What if you increase contributions?",
    paramLabel: "Increase",
    defaultValue: 50,
    unit: "%",
    modify: (input, value) => ({
      ...input,
      annualContributions: input.annualContributions * (1 + value / 100),
    }),
  },
  {
    id: "lower_returns",
    name: "Lower Returns",
    icon: Percent,
    description: "What if the market underperforms?",
    paramLabel: "Return",
    defaultValue: 4,
    unit: "%",
    modify: (input, value) => ({
      ...input,
      expectedReturnPct: value,
    }),
  },
  {
    id: "high_inflation",
    name: "High Inflation",
    icon: Percent,
    description: "What if inflation stays elevated?",
    paramLabel: "Inflation",
    defaultValue: 5,
    unit: "%",
    modify: (input, value) => ({
      ...input,
      inflationPct: value,
    }),
  },
  {
    id: "no_ss",
    name: "Reduced Social Security",
    icon: TrendingDown,
    description: "What if SS benefits are cut?",
    paramLabel: "Cut by",
    defaultValue: 100,
    unit: "%",
    modify: (input, value) => ({
      ...input,
      socialSecurityMonthlyIncome:
        input.socialSecurityMonthlyIncome * (1 - value / 100),
    }),
  },
];

type ScenarioResult = {
  portfolioAtRetirement: number;
  successRate: number;
  monthlyIncome: number;
  paramValue: number;
};

type Props = {
  baseInput: ProjectionInput;
  currentAge: number;
  retirementAge: number;
};

export function ScenarioRunner({ baseInput, currentAge }: Props) {
  const [results, setResults] = useState<Map<string, ScenarioResult>>(
    new Map()
  );
  const [baseResult, setBaseResult] = useState<ScenarioResult | null>(null);
  const [paramValues, setParamValues] = useState<Record<string, number>>(
    Object.fromEntries(SCENARIOS.map((s) => [s.id, s.defaultValue]))
  );
  const [runningId, setRunningId] = useState<string | null>(null);

  const ensureBase = () => {
    if (baseResult) return baseResult;
    const proj = calculateProjection(baseInput, currentAge);
    const mc = runMonteCarlo(baseInput, currentAge, 500);
    const base: ScenarioResult = {
      portfolioAtRetirement: proj.portfolioAtRetirement,
      successRate: mc.successRate,
      monthlyIncome: proj.totalMonthlyRetirementIncome,
      paramValue: 0,
    };
    setBaseResult(base);
    return base;
  };

  const runScenario = (scenario: ScenarioConfig) => {
    setRunningId(scenario.id);
    ensureBase();

    const value = paramValues[scenario.id];
    const modifiedInput = scenario.modify(baseInput, value);
    const proj = calculateProjection(modifiedInput, currentAge);
    const mc = runMonteCarlo(modifiedInput, currentAge, 500);

    setResults((prev) => {
      const next = new Map(prev);
      next.set(scenario.id, {
        portfolioAtRetirement: proj.portfolioAtRetirement,
        successRate: mc.successRate,
        monthlyIncome: proj.totalMonthlyRetirementIncome,
        paramValue: value,
      });
      return next;
    });
    setRunningId(null);
  };

  const runAll = () => {
    ensureBase();
    for (const s of SCENARIOS) runScenario(s);
  };

  const resetAll = () => {
    setResults(new Map());
    setBaseResult(null);
    setParamValues(
      Object.fromEntries(SCENARIOS.map((s) => [s.id, s.defaultValue]))
    );
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Scenario Analysis</CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              Adjust the numbers and run each scenario, or run them all at once
            </p>
          </div>
          <div className="flex gap-2">
            {results.size > 0 && (
              <Button variant="outline" size="sm" onClick={resetAll}>
                <RotateCcw className="mr-2 h-3.5 w-3.5" />
                Reset
              </Button>
            )}
            <Button size="sm" onClick={runAll}>
              <Play className="mr-2 h-3.5 w-3.5" />
              Run All
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {/* Base case */}
        {baseResult && (
          <div className="mb-4 rounded-lg border bg-muted/30 border-primary/30 p-3 flex items-center justify-between">
            <span className="font-medium text-sm">Base Case (Current Plan)</span>
            <div className="flex items-center gap-6 text-sm">
              <div className="text-right">
                <p className="text-xs text-muted-foreground">At Retirement</p>
                <p className="font-mono font-medium">
                  {formatCurrency(baseResult.portfolioAtRetirement)}
                </p>
              </div>
              <div className="text-right min-w-[50px]">
                <p className="text-xs text-muted-foreground">Success</p>
                <p
                  className={cn(
                    "font-mono font-medium",
                    baseResult.successRate >= 80
                      ? "text-green-500"
                      : baseResult.successRate >= 60
                        ? "text-yellow-500"
                        : "text-red-500"
                  )}
                >
                  {baseResult.successRate}%
                </p>
              </div>
              <div className="text-right min-w-[70px]">
                <p className="text-xs text-muted-foreground">Monthly</p>
                <p className="font-mono font-medium">
                  {formatCurrency(baseResult.monthlyIncome)}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Scenario cards */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {SCENARIOS.map((scenario) => {
            const result = results.get(scenario.id);
            const diff =
              result && baseResult
                ? result.portfolioAtRetirement -
                  baseResult.portfolioAtRetirement
                : null;
            const diffPct =
              diff !== null &&
              baseResult &&
              baseResult.portfolioAtRetirement > 0
                ? (diff / baseResult.portfolioAtRetirement) * 100
                : null;

            return (
              <div key={scenario.id} className="rounded-lg border p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <scenario.icon className="h-4 w-4 text-primary" />
                  <span className="font-medium text-sm">{scenario.name}</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {scenario.description}
                </p>

                {/* Adjustable parameter */}
                <div className="flex items-center gap-2">
                  <Label className="text-xs whitespace-nowrap">
                    {scenario.paramLabel}
                  </Label>
                  <Input
                    type="number"
                    value={paramValues[scenario.id]}
                    onChange={(e) =>
                      setParamValues((prev) => ({
                        ...prev,
                        [scenario.id]: Number(e.target.value),
                      }))
                    }
                    className="h-7 w-20 text-xs font-mono"
                    step={scenario.unit === "yrs" ? 1 : 0.5}
                  />
                  <span className="text-xs text-muted-foreground">
                    {scenario.unit}
                  </span>
                </div>

                {/* Results or run button */}
                {result ? (
                  <div className="space-y-2">
                    <div className="grid grid-cols-3 gap-1 text-center">
                      <div>
                        <p className="text-[10px] text-muted-foreground">
                          Portfolio
                        </p>
                        <p className="font-mono text-xs font-medium">
                          {formatCurrency(result.portfolioAtRetirement)}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] text-muted-foreground">
                          Success
                        </p>
                        <p
                          className={cn(
                            "font-mono text-xs font-medium",
                            result.successRate >= 80
                              ? "text-green-500"
                              : result.successRate >= 60
                                ? "text-yellow-500"
                                : "text-red-500"
                          )}
                        >
                          {result.successRate}%
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] text-muted-foreground">
                          Monthly
                        </p>
                        <p className="font-mono text-xs font-medium">
                          {formatCurrency(result.monthlyIncome)}
                        </p>
                      </div>
                    </div>
                    {diffPct !== null && (
                      <p
                        className={cn(
                          "text-center text-xs font-mono",
                          diff! >= 0 ? "text-green-500" : "text-red-500"
                        )}
                      >
                        {diff! >= 0 ? "+" : ""}
                        {formatCurrency(diff!)} (
                        {diffPct >= 0 ? "+" : ""}
                        {Math.round(diffPct)}%)
                      </p>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-full h-7 text-xs"
                      onClick={() => runScenario(scenario)}
                    >
                      <RotateCcw className="mr-1 h-3 w-3" />
                      Re-run with new value
                    </Button>
                  </div>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full"
                    onClick={() => runScenario(scenario)}
                    disabled={runningId === scenario.id}
                  >
                    <PlayCircle className="mr-2 h-3.5 w-3.5" />
                    {runningId === scenario.id ? "Running..." : "Run Scenario"}
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
