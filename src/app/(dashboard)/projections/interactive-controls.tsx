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
  isActivelyContributing: boolean;
  annualContribution: number;
  annualEscalation: number;
  maxAnnualContribution: number;
  contributionMethod: string;
  salary: number;
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
  savedControls?: {
    ssClaimAgeSelf: number | null;
    ssClaimAgeSpouse: number | null;
    monthlySpending: number | null;
    withdrawalRate: number | null;
    retirementYears: number | null;
    marketScenario: string | null;
  };
};

// Debounced save to avoid hammering the API on every slider tick
let saveTimeout: ReturnType<typeof setTimeout> | null = null;
function saveControls(data: Record<string, unknown>) {
  if (saveTimeout) clearTimeout(saveTimeout);
  saveTimeout = setTimeout(() => {
    fetch("/api/settings/projection-controls", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }).catch(() => {}); // fire-and-forget
  }, 800);
}

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
  savedControls,
}: Props) {
  // Interactive state — initialize from saved values or defaults
  const [selfSSAge, setSelfSSAge] = useState(savedControls?.ssClaimAgeSelf || selfFRA || 67);
  const [spouseSSAge, setSpouseSSAge] = useState(savedControls?.ssClaimAgeSpouse || spouseFRA || 67);
  const [monthlySpending, setMonthlySpending] = useState(savedControls?.monthlySpending || monthlyExpenses);
  const [withdrawalRatePct, setWithdrawalRatePct] = useState(savedControls?.withdrawalRate || 4.0);
  const [retirementYears, setRetirementYears] = useState(savedControls?.retirementYears || 35);
  const [selectedScenario, setSelectedScenario] = useState<string>(savedControls?.marketScenario || "moderate");

  const scenario = MARKET_SCENARIOS.find((s) => s.id === selectedScenario) || MARKET_SCENARIOS[1];

  // Wrapper functions that update state AND persist
  const updateSelfSSAge = (v: number) => { setSelfSSAge(v); saveControls({ ssClaimAgeSelf: v }); };
  const updateSpouseSSAge = (v: number) => { setSpouseSSAge(v); saveControls({ ssClaimAgeSpouse: v }); };
  const updateSpending = (v: number) => { setMonthlySpending(v); saveControls({ monthlySpending: v }); };
  const updateWithdrawalRate = (v: number) => { setWithdrawalRatePct(v); saveControls({ withdrawalRate: v }); };
  const updateRetirementYears = (v: number) => { setRetirementYears(v); saveControls({ retirementYears: v }); };
  const updateScenario = (v: string) => { setSelectedScenario(v); saveControls({ marketScenario: v }); };

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

  // Run deterministic projection
  const projection = useMemo(
    () =>
      runDetailedProjection({
        accounts,
        totalAnnualContributions: annualContributions,
        yearsToRetirement,
        yearsInRetirement: retirementYears,
        startAge: currentAge,
        returnPct: scenario.returnPct,
        inflationPct: scenario.inflationPct,
        annualExpenses: monthlySpending * 12,
        withdrawalRatePct,
        annualSSIncome: combinedSSAnnual,
        ssStartYear,
      }),
    [accounts, annualContributions, yearsToRetirement, retirementYears, currentAge, scenario, monthlySpending, withdrawalRatePct, combinedSSAnnual, ssStartYear]
  );

  // Run Monte Carlo (client-side, reactive to all controls)
  const monteCarloData = useMemo(() => {
    const totalYears = yearsToRetirement + retirementYears;
    const meanReturn = scenario.returnPct / 100;
    const stdDev = scenario.volatility / 100;
    const annualExpenses = monthlySpending * 12;
    const expenseBasedWithdrawal = Math.max(0, annualExpenses - combinedSSAnnual);
    const startValue = accounts.reduce((s, a) => s + a.value, 0);
    const numSims = 500;

    const allPaths: number[][] = [];
    let successes = 0;

    for (let sim = 0; sim < numSims; sim++) {
      const path: number[] = [];
      let portfolio = startValue;
      for (let y = 0; y < totalYears; y++) {
        const u1 = Math.random();
        const u2 = Math.random();
        const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
        const yearReturn = meanReturn + stdDev * z;
        const growth = portfolio * yearReturn;
        if (y < yearsToRetirement) {
          portfolio += growth + annualContributions;
        } else {
          // Grow withdrawals with inflation each year of retirement
          const retYear = y - yearsToRetirement;
          const rateBasedWithdrawal = portfolio * (withdrawalRatePct / 100);
          const inflatedExpenseWithdrawal = expenseBasedWithdrawal * Math.pow(1 + scenario.inflationPct / 100, retYear);
          const withdrawal = Math.max(inflatedExpenseWithdrawal, rateBasedWithdrawal);
          portfolio = portfolio + growth - Math.min(withdrawal, portfolio + growth);
        }
        portfolio = Math.max(0, portfolio);
        path.push(Math.round(portfolio));
      }
      allPaths.push(path);
      if (path[path.length - 1] > 0) successes++;
    }

    const percentiles = { p10: [] as number[], p25: [] as number[], p50: [] as number[], p75: [] as number[], p90: [] as number[] };
    const ages: number[] = [];
    for (let y = 0; y < totalYears; y++) {
      const values = allPaths.map((p) => p[y]).sort((a, b) => a - b);
      percentiles.p10.push(values[Math.floor(numSims * 0.1)]);
      percentiles.p25.push(values[Math.floor(numSims * 0.25)]);
      percentiles.p50.push(values[Math.floor(numSims * 0.5)]);
      percentiles.p75.push(values[Math.floor(numSims * 0.75)]);
      percentiles.p90.push(values[Math.floor(numSims * 0.9)]);
      ages.push(currentAge + y + 1);
    }

    return {
      chartData: ages.map((age, i) => ({
        age,
        p10: percentiles.p10[i], p25: percentiles.p25[i],
        p50: percentiles.p50[i], p75: percentiles.p75[i],
        p90: percentiles.p90[i],
      })),
      successRate: Math.round((successes / numSims) * 100),
      medianAtRetirement: percentiles.p50[yearsToRetirement - 1] || 0,
      worstCase: percentiles.p10[yearsToRetirement - 1] || 0,
      bestCase: percentiles.p90[yearsToRetirement - 1] || 0,
    };
  }, [accounts, annualContributions, yearsToRetirement, retirementYears, currentAge, scenario, monthlySpending, withdrawalRatePct, combinedSSAnnual]);

  // Chart data
  const chartData = projection.ages.map((age, i) => ({
    age,
    total: projection.totalValues[i],
    phase: projection.phases[i],
  }));

  const portfolioAtRetirement = projection.totalValues[yearsToRetirement - 1] || 0;
  const portfolioAt80 = projection.totalValues[80 - currentAge - 1] || 0;
  const portfolioAt90 = projection.totalValues[90 - currentAge - 1] || 0;
  const monthlyFromPortfolio = Math.round((portfolioAtRetirement * (withdrawalRatePct / 100)) / 12);
  const totalMonthlyRetirementIncome = monthlyFromPortfolio + selfSSMonthly + spouseSSMonthly;

  // Sustainability analysis: does the portfolio last the full retirement period?
  const endOfRetirementIdx = yearsToRetirement + retirementYears - 1;
  const portfolioAtEnd = endOfRetirementIdx < projection.totalValues.length
    ? projection.totalValues[endOfRetirementIdx]
    : 0;
  const portfolioLastsFullPeriod = portfolioAtEnd > 0;

  // Find the exact year the portfolio runs out (if it does)
  let portfolioRunsOutAge: number | null = null;
  if (!portfolioLastsFullPeriod) {
    for (let i = yearsToRetirement; i < projection.totalValues.length; i++) {
      if (projection.totalValues[i] <= 0) {
        portfolioRunsOutAge = projection.ages[i];
        break;
      }
    }
  }
  const yearsPortfolioLasts = portfolioRunsOutAge
    ? portfolioRunsOutAge - retirementAge
    : retirementYears;

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
                  onClick={() => updateScenario(s.id)}
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
                onValueChange={(v) => updateSelfSSAge(Array.isArray(v) ? v[0] : v)}
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
                onValueChange={(v) => updateSpouseSSAge(Array.isArray(v) ? v[0] : v)}
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

          {/* Monthly Retirement Spending + Withdrawal Rate */}
          <div className="grid gap-6 sm:grid-cols-2">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-sm">Monthly Retirement Spending</Label>
                <Badge variant="outline" className="font-mono">
                  {formatCurrency(monthlySpending)}/mo
                </Badge>
              </div>
              <Slider
                value={[monthlySpending]}
                onValueChange={(v) => updateSpending(Array.isArray(v) ? v[0] : v)}
                min={2000}
                max={25000}
                step={250}
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>$2,000/mo</span>
                <span>$25,000/mo</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Your expected monthly household expenses in retirement
              </p>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-sm">Withdrawal Rate</Label>
                <Badge variant="outline" className="font-mono">
                  {withdrawalRatePct}%
                </Badge>
              </div>
              <Slider
                value={[withdrawalRatePct * 10]}
                onValueChange={(v) => updateWithdrawalRate((Array.isArray(v) ? v[0] : v) / 10)}
                min={20}
                max={60}
                step={5}
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>2% (conservative)</span>
                <span>6% (aggressive)</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Annual % of portfolio withdrawn in retirement. 4% is the traditional &quot;safe withdrawal rate&quot;.
              </p>
            </div>
          </div>

          {/* Retirement Duration */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-sm">Years in Retirement</Label>
              <Badge variant="outline" className="font-mono">
                {retirementYears} years (to age {retirementAge + retirementYears})
              </Badge>
            </div>
            <Slider
              value={[retirementYears]}
              onValueChange={(v) => updateRetirementYears(Array.isArray(v) ? v[0] : v)}
              min={10}
              max={45}
              step={1}
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>10 years (age {retirementAge + 10})</span>
              <span>45 years (age {retirementAge + 45})</span>
            </div>
            <p className="text-xs text-muted-foreground">
              How long your money needs to last. Average life expectancy is ~85, but plan for longer.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Summary Cards — all reactive to slider controls */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs text-muted-foreground">Portfolio at Retirement ({retirementAge})</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xl font-bold font-mono">{formatCurrency(portfolioAtRetirement)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs text-muted-foreground">Monthly Spending vs Income</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">
              Spending: <span className="font-mono text-foreground">{formatCurrency(monthlySpending)}</span>/mo
            </p>
            <p className="text-xs text-muted-foreground">
              Income: <span className="font-mono text-foreground">{formatCurrency(monthlyFromPortfolio + selfSSMonthly + spouseSSMonthly)}</span>/mo
            </p>
            <p className="text-xs mt-1">
              ({formatCurrency(monthlyFromPortfolio)} 4% rule + {formatCurrency(selfSSMonthly + spouseSSMonthly)} SS)
            </p>
            {monthlyFromPortfolio + selfSSMonthly + spouseSSMonthly >= monthlySpending ? (
              <p className="text-xs text-green-500 font-medium mt-1">
                +{formatCurrency(monthlyFromPortfolio + selfSSMonthly + spouseSSMonthly - monthlySpending)} surplus
              </p>
            ) : (
              <p className="text-xs text-red-500 font-medium mt-1">
                -{formatCurrency(monthlySpending - monthlyFromPortfolio - selfSSMonthly - spouseSSMonthly)} shortfall
              </p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs text-muted-foreground">Portfolio at 80</CardTitle>
          </CardHeader>
          <CardContent>
            <p className={cn("text-xl font-bold font-mono", portfolioAt80 > 0 ? "" : "text-red-500")}>
              {formatCurrency(portfolioAt80)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs text-muted-foreground">Portfolio at 90</CardTitle>
          </CardHeader>
          <CardContent>
            <p className={cn("text-xl font-bold font-mono", portfolioAt90 > 0 ? "" : "text-red-500")}>
              {formatCurrency(portfolioAt90)}
            </p>
            {portfolioAt90 <= 0 && (
              <p className="text-xs text-red-500">Money runs out before 90</p>
            )}
          </CardContent>
        </Card>

        {/* Will It Last? Card */}
        <Card className={cn(
          "border-2",
          portfolioLastsFullPeriod ? "border-green-500/50 bg-green-500/5" : "border-red-500/50 bg-red-500/5"
        )}>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs text-muted-foreground">
              Will It Last? ({retirementYears} years)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {portfolioLastsFullPeriod ? (
              <>
                <p className="text-xl font-bold text-green-500">Yes</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Portfolio lasts all {retirementYears} years to age {retirementAge + retirementYears}
                </p>
                <p className="text-xs text-green-500 mt-0.5">
                  {formatCurrency(portfolioAtEnd)} remaining at end
                </p>
              </>
            ) : (
              <>
                <p className="text-xl font-bold text-red-500">No</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Runs out after {yearsPortfolioLasts} years at age {portfolioRunsOutAge}
                </p>
                <p className="text-xs text-red-500 mt-0.5">
                  {retirementYears - yearsPortfolioLasts} year shortfall — need to reduce spending or increase savings
                </p>
              </>
            )}
            <p className="text-xs text-muted-foreground mt-2">
              Based on {scenario.name} ({scenario.returnPct}% return), {formatCurrency(monthlySpending)}/mo spending, {withdrawalRatePct}% withdrawal rate
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

      {/* Monte Carlo Fan Chart */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle>Monte Carlo Simulation</CardTitle>
          <p className="text-sm text-muted-foreground">
            500 random scenarios — {monteCarloData.successRate}% success rate (money lasts {retirementYears}+ years)
          </p>
        </CardHeader>
        <CardContent>
          <div className="h-[280px] sm:h-[320px] -ml-2">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={monteCarloData.chartData} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" strokeOpacity={0.5} vertical={false} />
                <XAxis dataKey="age" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={(v) => formatCompactCurrency(v)} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} axisLine={false} tickLine={false} width={60} />
                <Tooltip
                  formatter={(value) => formatCurrency(Number(value))}
                  labelFormatter={(age) => `Age ${age}`}
                  contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", boxShadow: "0 4px 12px rgba(0,0,0,0.15)", fontSize: "13px", padding: "8px 12px" }}
                />
                <ReferenceLine x={retirementAge} stroke="hsl(var(--muted-foreground))" strokeDasharray="5 5" />
                <Area type="monotone" dataKey="p90" stackId="1" stroke="none" fill="#22c55e" fillOpacity={0.08} name="90th %" />
                <Area type="monotone" dataKey="p75" stackId="2" stroke="none" fill="#22c55e" fillOpacity={0.12} name="75th %" />
                <Area type="monotone" dataKey="p50" stackId="3" stroke="#22c55e" fill="#22c55e" fillOpacity={0.2} strokeWidth={2.5} name="Median" dot={false} />
                <Area type="monotone" dataKey="p25" stackId="4" stroke="none" fill="#22c55e" fillOpacity={0.12} name="25th %" />
                <Area type="monotone" dataKey="p10" stackId="5" stroke="none" fill="#22c55e" fillOpacity={0.08} name="10th %" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <div className="grid grid-cols-3 gap-4 mt-3 text-center">
            <div>
              <p className="text-xs text-muted-foreground">Success Rate</p>
              <p className={cn("font-mono font-bold text-lg",
                monteCarloData.successRate >= 80 ? "text-green-500" :
                monteCarloData.successRate >= 60 ? "text-yellow-500" : "text-red-500"
              )}>
                {monteCarloData.successRate}%
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Median at Retirement</p>
              <p className="font-mono font-medium">{formatCurrency(monteCarloData.medianAtRetirement)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Range (10th-90th)</p>
              <p className="font-mono text-sm">{formatCurrency(monteCarloData.worstCase)} — {formatCurrency(monteCarloData.bestCase)}</p>
            </div>
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
