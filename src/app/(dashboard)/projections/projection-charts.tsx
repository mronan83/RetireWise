"use client";

import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatCompactCurrency } from "@/lib/utils/format";
import type {
  ProjectionResult,
  MonteCarloResult,
  WithdrawalStrategy,
  ProjectionInput,
} from "@/lib/utils/projections";
import { cn } from "@/lib/utils";

type Props = {
  projection: ProjectionResult;
  monteCarlo: MonteCarloResult;
  strategies: WithdrawalStrategy[];
  input: ProjectionInput;
  currentAge: number;
  retirementAge: number;
};

export function ProjectionCharts({
  projection,
  monteCarlo,
  strategies,
  input,
  currentAge,
  retirementAge,
}: Props) {
  // Summary cards
  const summaryItems = [
    {
      label: "Portfolio at Retirement",
      value: formatCurrency(projection.portfolioAtRetirement),
      sub: `${formatCurrency(projection.portfolioAtRetirementReal)} in today's dollars`,
    },
    {
      label: "Monthly Retirement Income",
      value: formatCurrency(projection.totalMonthlyRetirementIncome),
      sub: `${formatCurrency(projection.monthlyIncomeFromPortfolio)} portfolio + ${formatCurrency(input.socialSecurityMonthlyIncome)} SS`,
    },
    {
      label: "Monte Carlo Success Rate",
      value: `${monteCarlo.successRate}%`,
      sub: `of 1,000 scenarios, money lasts ${input.yearsInRetirement}+ years`,
      color:
        monteCarlo.successRate >= 80
          ? "text-green-500"
          : monteCarlo.successRate >= 60
            ? "text-yellow-500"
            : "text-red-500",
    },
    {
      label: "Can Sustain Retirement",
      value: projection.canSustainRetirement ? "Yes" : "No",
      sub: projection.canSustainRetirement
        ? `Portfolio lasts ${projection.yearsPortfolioLasts}+ years`
        : `Portfolio runs out after ${projection.yearsPortfolioLasts} years`,
      color: projection.canSustainRetirement
        ? "text-green-500"
        : "text-red-500",
    },
  ];

  // Projection chart data
  const projectionData = projection.yearByYear.map((y) => ({
    age: y.age,
    value: y.portfolioValue,
    phase: y.phase,
  }));

  // Monte Carlo fan chart data
  const monteCarloData = monteCarlo.years.map((age, i) => ({
    age,
    p10: monteCarlo.percentiles.p10[i],
    p25: monteCarlo.percentiles.p25[i],
    p50: monteCarlo.percentiles.p50[i],
    p75: monteCarlo.percentiles.p75[i],
    p90: monteCarlo.percentiles.p90[i],
  }));

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {summaryItems.map((item) => (
          <Card key={item.label}>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs text-muted-foreground font-medium">
                {item.label}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p
                className={cn(
                  "text-xl font-bold font-mono",
                  item.color || ""
                )}
              >
                {item.value}
              </p>
              <p className="text-xs text-muted-foreground mt-1">{item.sub}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Deterministic Projection */}
      <Card>
        <CardHeader>
          <CardTitle>Portfolio Projection</CardTitle>
          <p className="text-sm text-muted-foreground">
            {input.expectedReturnPct}% return, {input.inflationPct}% inflation,{" "}
            {formatCurrency(input.annualContributions)}/yr contributions
          </p>
        </CardHeader>
        <CardContent>
          <div className="h-[350px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={projectionData}>
                <defs>
                  <linearGradient id="projGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(142, 71%, 45%)" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="hsl(142, 71%, 45%)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis
                  dataKey="age"
                  tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
                  label={{ value: "Age", position: "bottom", fill: "hsl(var(--muted-foreground))" }}
                />
                <YAxis
                  tickFormatter={(v) => formatCompactCurrency(v)}
                  tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
                  width={70}
                />
                <Tooltip
                  formatter={(value) => [formatCurrency(Number(value)), "Portfolio"]}
                  labelFormatter={(age) => `Age ${age}`}
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "var(--radius)",
                  }}
                />
                <ReferenceLine
                  x={retirementAge}
                  stroke="hsl(var(--muted-foreground))"
                  strokeDasharray="5 5"
                  label={{ value: "Retirement", fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
                />
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke="hsl(142, 71%, 45%)"
                  fill="url(#projGrad)"
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Monte Carlo Fan Chart */}
      <Card>
        <CardHeader>
          <CardTitle>Monte Carlo Simulation</CardTitle>
          <p className="text-sm text-muted-foreground">
            1,000 random scenarios showing range of outcomes (10th to 90th percentile)
          </p>
        </CardHeader>
        <CardContent>
          <div className="h-[350px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={monteCarloData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis
                  dataKey="age"
                  tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
                  label={{ value: "Age", position: "bottom", fill: "hsl(var(--muted-foreground))" }}
                />
                <YAxis
                  tickFormatter={(v) => formatCompactCurrency(v)}
                  tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
                  width={70}
                />
                <Tooltip
                  formatter={(value) => formatCurrency(Number(value))}
                  labelFormatter={(age) => `Age ${age}`}
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "var(--radius)",
                  }}
                />
                <ReferenceLine
                  x={retirementAge}
                  stroke="hsl(var(--muted-foreground))"
                  strokeDasharray="5 5"
                />
                <Area type="monotone" dataKey="p90" stackId="1" stroke="none" fill="hsl(221, 83%, 53%)" fillOpacity={0.1} name="90th percentile" />
                <Area type="monotone" dataKey="p75" stackId="2" stroke="none" fill="hsl(221, 83%, 53%)" fillOpacity={0.15} name="75th percentile" />
                <Area type="monotone" dataKey="p50" stackId="3" stroke="hsl(221, 83%, 53%)" fill="hsl(221, 83%, 53%)" fillOpacity={0.25} strokeWidth={2} name="Median" />
                <Area type="monotone" dataKey="p25" stackId="4" stroke="none" fill="hsl(221, 83%, 53%)" fillOpacity={0.15} name="25th percentile" />
                <Area type="monotone" dataKey="p10" stackId="5" stroke="none" fill="hsl(221, 83%, 53%)" fillOpacity={0.1} name="10th percentile" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <div className="flex gap-4 mt-3 text-xs text-muted-foreground justify-center">
            <span>Darker = more likely</span>
            <span>Median: {formatCurrency(monteCarlo.medianAtRetirement)} at retirement</span>
            <span>Range: {formatCurrency(monteCarlo.worstCase)} – {formatCurrency(monteCarlo.bestCase)}</span>
          </div>
        </CardContent>
      </Card>

      {/* Withdrawal Strategy Comparison */}
      <Card>
        <CardHeader>
          <CardTitle>Withdrawal Strategy Comparison</CardTitle>
          <p className="text-sm text-muted-foreground">
            Which order to draw from your accounts in retirement minimizes lifetime taxes
          </p>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2">
            {strategies.map((s) => {
              const isBest = s.totalTaxesPaid === Math.min(...strategies.map((x) => x.totalTaxesPaid));
              return (
                <div
                  key={s.name}
                  className={cn(
                    "rounded-lg border p-4",
                    isBest ? "border-green-500/50 bg-green-500/5" : ""
                  )}
                >
                  <div className="flex items-center gap-2">
                    <h4 className="font-medium text-sm">{s.name}</h4>
                    {isBest && (
                      <Badge variant="secondary" className="text-xs text-green-500">
                        Lowest Taxes
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {s.description}
                  </p>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <p className="text-xs text-muted-foreground">Total Taxes (30yr)</p>
                      <p className="font-mono font-medium">
                        {formatCurrency(s.totalTaxesPaid)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Portfolio Remaining</p>
                      <p className="font-mono font-medium">
                        {formatCurrency(s.portfolioAtEnd)}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
