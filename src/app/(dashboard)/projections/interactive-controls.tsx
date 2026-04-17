"use client";

import { useState, useMemo } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatCurrency, formatCompactCurrency } from "@/lib/utils/format";
import {
  MARKET_SCENARIOS,
  adjustSSBenefit,
  runDetailedProjection,
  type MarketScenario,
} from "@/lib/utils/projection-scenarios";
import { cn } from "@/lib/utils";

type AccountInput = {
  name: string;
  owner: string;
  type: string;
  taxTreatment: string;
  value: number;
};

type Props = {
  accounts: AccountInput[];
  currentAge: number;
  retirementAge: number;
  spouseAge: number | null;
  selfSSAtFRA: number;
  spouseSSAtFRA: number;
  selfFRA: number;
  spouseFRA: number;
  monthlyExpenses: number;
  annualContributions: number;
};

export function InteractiveProjections({
  accounts,
  currentAge,
  retirementAge,
  spouseAge,
  selfSSAtFRA,
  spouseSSAtFRA,
  selfFRA,
  spouseFRA,
  monthlyExpenses,
  annualContributions,
}: Props) {
  // Interactive state
  const [selfSSAge, setSelfSSAge] = useState(selfFRA || 67);
  const [spouseSSAge, setSpouseSSAge] = useState(spouseFRA || 67);
  const [monthlyIncome, setMonthlyIncome] = useState(monthlyExpenses);
  const [selectedScenario, setSelectedScenario] = useState<string>("moderate");

  const scenario = MARKET_SCENARIOS.find((s) => s.id === selectedScenario) || MARKET_SCENARIOS[1];

  // Calculate adjusted SS benefits
  const selfSSMonthly = adjustSSBenefit(selfSSAtFRA, selfFRA || 67, selfSSAge);
  const spouseSSMonthly = adjustSSBenefit(spouseSSAtFRA, spouseFRA || 67, spouseSSAge);
  const combinedSSAnnual = (selfSSMonthly + spouseSSMonthly) * 12;

  // SS start year (when the first person starts claiming)
  const selfSSStartYear = Math.max(0, selfSSAge - currentAge);
  const spouseSSStartYear = spouseAge
    ? Math.max(0, spouseSSAge - spouseAge)
    : selfSSStartYear;
  const ssStartYear = Math.min(selfSSStartYear, spouseSSStartYear);

  const yearsToRetirement = Math.max(0, retirementAge - currentAge);

  // Run projection
  const projection = useMemo(
    () =>
      runDetailedProjection({
        accounts,
        totalAnnualContributions: annualContributions,
        yearsToRetirement,
        yearsInRetirement: 35,
        startAge: currentAge,
        returnPct: scenario.returnPct,
        inflationPct: scenario.inflationPct,
        annualExpenses: monthlyIncome * 12,
        annualSSIncome: combinedSSAnnual,
        ssStartYear,
      }),
    [accounts, annualContributions, yearsToRetirement, currentAge, scenario, monthlyIncome, combinedSSAnnual, ssStartYear]
  );

  // Chart data
  const chartData = projection.ages.map((age, i) => ({
    age,
    total: projection.totalValues[i],
    phase: projection.phases[i],
  }));

  const portfolioAtRetirement = projection.totalValues[yearsToRetirement - 1] || 0;
  const portfolioAt80 = projection.totalValues[80 - currentAge - 1] || 0;
  const portfolioAt90 = projection.totalValues[90 - currentAge - 1] || 0;
  const monthlyFromPortfolio = Math.round((portfolioAtRetirement * 0.04) / 12);

  return (
    <div className="space-y-6">
      {/* Controls */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle>Projection Controls</CardTitle>
          <p className="text-sm text-muted-foreground">
            Adjust these inputs to see how they affect your retirement
          </p>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Market Scenario */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Market Scenario</Label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {MARKET_SCENARIOS.map((s) => (
                <button
                  key={s.id}
                  onClick={() => setSelectedScenario(s.id)}
                  className={cn(
                    "rounded-lg border p-2.5 text-left transition-colors text-xs",
                    selectedScenario === s.id
                      ? "border-primary bg-primary/5"
                      : "hover:bg-accent/50"
                  )}
                >
                  <p className="font-medium">{s.name}</p>
                  <p className="text-muted-foreground mt-0.5">
                    {s.returnPct}% return, {s.inflationPct}% inflation
                  </p>
                </button>
              ))}
            </div>
          </div>

          {/* Social Security Claiming Ages */}
          <div className="grid gap-6 sm:grid-cols-2">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-sm">Your SS Claiming Age</Label>
                <Badge variant="outline" className="font-mono">{selfSSAge}</Badge>
              </div>
              <Slider
                value={[selfSSAge]}
                onValueChange={(v) => setSelfSSAge(Array.isArray(v) ? v[0] : v)}
                min={62}
                max={70}
                step={1}
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>62 ({formatCurrency(adjustSSBenefit(selfSSAtFRA, selfFRA || 67, 62))}/mo)</span>
                <span>70 ({formatCurrency(adjustSSBenefit(selfSSAtFRA, selfFRA || 67, 70))}/mo)</span>
              </div>
              <p className="text-xs text-center font-mono text-primary">
                {formatCurrency(selfSSMonthly)}/mo at age {selfSSAge}
              </p>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-sm">Spouse SS Claiming Age</Label>
                <Badge variant="outline" className="font-mono">{spouseSSAge}</Badge>
              </div>
              <Slider
                value={[spouseSSAge]}
                onValueChange={(v) => setSpouseSSAge(Array.isArray(v) ? v[0] : v)}
                min={62}
                max={70}
                step={1}
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>62 ({formatCurrency(adjustSSBenefit(spouseSSAtFRA, spouseFRA || 67, 62))}/mo)</span>
                <span>70 ({formatCurrency(adjustSSBenefit(spouseSSAtFRA, spouseFRA || 67, 70))}/mo)</span>
              </div>
              <p className="text-xs text-center font-mono text-primary">
                {formatCurrency(spouseSSMonthly)}/mo at age {spouseSSAge}
              </p>
            </div>
          </div>

          {/* Monthly Retirement Expenses */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-sm">Monthly Retirement Spending</Label>
              <Badge variant="outline" className="font-mono">
                {formatCurrency(monthlyIncome)}/mo
              </Badge>
            </div>
            <Slider
              value={[monthlyIncome]}
              onValueChange={(v) => setMonthlyIncome(Array.isArray(v) ? v[0] : v)}
              min={2000}
              max={20000}
              step={500}
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>$2,000/mo</span>
              <span>$20,000/mo</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Summary */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs text-muted-foreground">At Retirement ({retirementAge})</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xl font-bold font-mono">{formatCurrency(portfolioAtRetirement)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs text-muted-foreground">Monthly Income (4% rule + SS)</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xl font-bold font-mono">
              {formatCurrency(monthlyFromPortfolio + selfSSMonthly + spouseSSMonthly)}
            </p>
            <p className="text-xs text-muted-foreground">
              {formatCurrency(monthlyFromPortfolio)} portfolio + {formatCurrency(selfSSMonthly + spouseSSMonthly)} SS
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs text-muted-foreground">At Age 80</CardTitle>
          </CardHeader>
          <CardContent>
            <p className={cn("text-xl font-bold font-mono", portfolioAt80 > 0 ? "" : "text-red-500")}>
              {formatCurrency(portfolioAt80)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs text-muted-foreground">At Age 90</CardTitle>
          </CardHeader>
          <CardContent>
            <p className={cn("text-xl font-bold font-mono", portfolioAt90 > 0 ? "" : "text-red-500")}>
              {formatCurrency(portfolioAt90)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Projection Chart */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle>Portfolio Projection — {scenario.name}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[280px] sm:h-[320px] -ml-2">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="interactiveGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#6366f1" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="#6366f1" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" strokeOpacity={0.5} vertical={false} />
                <XAxis dataKey="age" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={(v) => formatCompactCurrency(v)} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} axisLine={false} tickLine={false} width={60} />
                <Tooltip
                  formatter={(value) => [formatCurrency(Number(value)), "Portfolio"]}
                  labelFormatter={(age) => `Age ${age}`}
                  contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", boxShadow: "0 4px 12px rgba(0,0,0,0.15)", fontSize: "13px", padding: "8px 12px" }}
                />
                <ReferenceLine x={retirementAge} stroke="hsl(var(--muted-foreground))" strokeDasharray="5 5" label={{ value: "Retire", fill: "hsl(var(--muted-foreground))", fontSize: 10 }} />
                <Area type="monotone" dataKey="total" stroke="#6366f1" fill="url(#interactiveGrad)" strokeWidth={2.5} dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Detailed Tables */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle>Detailed Projections</CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="milestones">
            <TabsList className="mb-4">
              <TabsTrigger value="milestones">Key Milestones</TabsTrigger>
              <TabsTrigger value="accumulation">Accumulation (5yr)</TabsTrigger>
              <TabsTrigger value="drawdown">Drawdown (5yr)</TabsTrigger>
              <TabsTrigger value="yearly">Year-by-Year</TabsTrigger>
            </TabsList>

            {/* Key Milestones */}
            <TabsContent value="milestones">
              <div className="rounded-lg border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Milestone</TableHead>
                      {projection.accountProjections.map((ap) => (
                        <TableHead key={ap.name} className="text-right font-mono text-xs">{ap.name}</TableHead>
                      ))}
                      <TableHead className="text-right font-mono font-bold">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {[
                      { label: "Today", idx: -1 },
                      { label: `Retire (${retirementAge})`, idx: yearsToRetirement - 1 },
                      { label: "Age 70", idx: 70 - currentAge - 1 },
                      { label: "Age 75", idx: 75 - currentAge - 1 },
                      { label: "Age 80", idx: 80 - currentAge - 1 },
                      { label: "Age 85", idx: 85 - currentAge - 1 },
                      { label: "Age 90", idx: 90 - currentAge - 1 },
                      { label: "Age 95", idx: 95 - currentAge - 1 },
                    ]
                      .filter((m) => m.idx < projection.totalValues.length)
                      .map((milestone) => (
                        <TableRow key={milestone.label}>
                          <TableCell className="font-medium text-sm">{milestone.label}</TableCell>
                          {projection.accountProjections.map((ap) => (
                            <TableCell key={ap.name} className="text-right font-mono text-xs">
                              {milestone.idx === -1
                                ? formatCurrency(ap.currentValue)
                                : formatCurrency(ap.projectedValues[milestone.idx] || 0)}
                            </TableCell>
                          ))}
                          <TableCell className="text-right font-mono text-xs font-bold">
                            {milestone.idx === -1
                              ? formatCurrency(accounts.reduce((s, a) => s + a.value, 0))
                              : formatCurrency(projection.totalValues[milestone.idx] || 0)}
                          </TableCell>
                        </TableRow>
                      ))}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>

            {/* Accumulation Phase (5yr increments) */}
            <TabsContent value="accumulation">
              <div className="rounded-lg border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Age</TableHead>
                      <TableHead className="text-right">Contributions</TableHead>
                      {projection.accountProjections.map((ap) => (
                        <TableHead key={ap.name} className="text-right font-mono text-xs">{ap.name}</TableHead>
                      ))}
                      <TableHead className="text-right font-mono font-bold">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {projection.ages
                      .map((age, i) => ({ age, i }))
                      .filter(({ i }) => i < yearsToRetirement && (i % 5 === 0 || i === yearsToRetirement - 1))
                      .map(({ age, i }) => (
                        <TableRow key={i}>
                          <TableCell className="font-medium text-sm">{age}</TableCell>
                          <TableCell className="text-right font-mono text-xs text-green-500">
                            +{formatCurrency(projection.contributions[i])}
                          </TableCell>
                          {projection.accountProjections.map((ap) => (
                            <TableCell key={ap.name} className="text-right font-mono text-xs">
                              {formatCurrency(ap.projectedValues[i])}
                            </TableCell>
                          ))}
                          <TableCell className="text-right font-mono text-xs font-bold">
                            {formatCurrency(projection.totalValues[i])}
                          </TableCell>
                        </TableRow>
                      ))}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>

            {/* Drawdown Phase (5yr increments) */}
            <TabsContent value="drawdown">
              <div className="rounded-lg border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Age</TableHead>
                      <TableHead className="text-right">Withdrawal</TableHead>
                      <TableHead className="text-right">SS Income</TableHead>
                      {projection.accountProjections.map((ap) => (
                        <TableHead key={ap.name} className="text-right font-mono text-xs">{ap.name}</TableHead>
                      ))}
                      <TableHead className="text-right font-mono font-bold">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {projection.ages
                      .map((age, i) => ({ age, i }))
                      .filter(({ i }) => i >= yearsToRetirement && ((i - yearsToRetirement) % 5 === 0))
                      .map(({ age, i }) => (
                        <TableRow key={i}>
                          <TableCell className="font-medium text-sm">{age}</TableCell>
                          <TableCell className="text-right font-mono text-xs text-red-500">
                            -{formatCurrency(projection.withdrawals[i])}
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs text-green-500">
                            +{formatCurrency(projection.ssIncome[i])}
                          </TableCell>
                          {projection.accountProjections.map((ap) => (
                            <TableCell key={ap.name} className="text-right font-mono text-xs">
                              {formatCurrency(ap.projectedValues[i])}
                            </TableCell>
                          ))}
                          <TableCell className="text-right font-mono text-xs font-bold">
                            {formatCurrency(projection.totalValues[i])}
                          </TableCell>
                        </TableRow>
                      ))}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>

            {/* Full Year-by-Year */}
            <TabsContent value="yearly">
              <div className="rounded-lg border overflow-x-auto max-h-[500px] overflow-y-auto">
                <Table>
                  <TableHeader className="sticky top-0 bg-card z-10">
                    <TableRow>
                      <TableHead>Age</TableHead>
                      <TableHead>Phase</TableHead>
                      <TableHead className="text-right">In/Out</TableHead>
                      {projection.accountProjections.map((ap) => (
                        <TableHead key={ap.name} className="text-right font-mono text-xs">{ap.name}</TableHead>
                      ))}
                      <TableHead className="text-right font-mono font-bold">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {projection.ages.map((age, i) => (
                      <TableRow key={i} className={i === yearsToRetirement ? "border-t-2 border-primary" : ""}>
                        <TableCell className="font-medium text-xs">{age}</TableCell>
                        <TableCell>
                          <Badge variant={projection.phases[i] === "accumulation" ? "secondary" : "default"} className="text-[10px]">
                            {projection.phases[i] === "accumulation" ? "Save" : "Draw"}
                          </Badge>
                        </TableCell>
                        <TableCell className={cn("text-right font-mono text-xs",
                          projection.phases[i] === "accumulation" ? "text-green-500" : "text-red-500"
                        )}>
                          {projection.phases[i] === "accumulation"
                            ? `+${formatCurrency(projection.contributions[i])}`
                            : `-${formatCurrency(projection.withdrawals[i])}`}
                        </TableCell>
                        {projection.accountProjections.map((ap) => (
                          <TableCell key={ap.name} className="text-right font-mono text-xs">
                            {formatCurrency(ap.projectedValues[i])}
                          </TableCell>
                        ))}
                        <TableCell className="text-right font-mono text-xs font-bold">
                          {formatCurrency(projection.totalValues[i])}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
