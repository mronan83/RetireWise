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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { HelpTip } from "@/components/ui/help-tip";
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
  contributionPct: number;
  employerMatchRate: number;
  employerMatchMaxPct: number;
  salary: number;
  salaryGrowth: import("@/lib/utils/salary-growth").SalaryGrowthConfig | null;
  ownerRetirementYear?: number;
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
    maxWithdrawalAmount: number | null;
    retirementYears: number | null;
    marketScenario: string | null;
    withdrawalMethod: string | null;
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
  const [withdrawalMethod, setWithdrawalMethod] = useState<"expense" | "rate" | "higher">(
    (savedControls?.withdrawalMethod as "expense" | "rate" | "higher") || "expense"
  );
  const [maxWithdrawalAmount, setMaxWithdrawalAmount] = useState<number | null>(
    savedControls?.maxWithdrawalAmount ?? null
  );
  const [retirementYears, setRetirementYears] = useState(savedControls?.retirementYears || 35);
  const [selectedScenario, setSelectedScenario] = useState<string>(savedControls?.marketScenario || "moderate");

  const scenario = MARKET_SCENARIOS.find((s) => s.id === selectedScenario) || MARKET_SCENARIOS[1];

  // Wrapper functions that update state AND persist
  const updateSelfSSAge = (v: number) => { setSelfSSAge(v); saveControls({ ssClaimAgeSelf: v }); };
  const updateSpouseSSAge = (v: number) => { setSpouseSSAge(v); saveControls({ ssClaimAgeSpouse: v }); };
  const updateSpending = (v: number) => { setMonthlySpending(v); saveControls({ monthlySpending: v }); };
  const updateWithdrawalRate = (v: number) => { setWithdrawalRatePct(v); saveControls({ withdrawalRate: v }); };
  const updateWithdrawalMethod = (v: "expense" | "rate" | "higher") => { setWithdrawalMethod(v); saveControls({ withdrawalMethod: v }); };
  const updateMaxWithdrawal = (v: number | null) => { setMaxWithdrawalAmount(v); saveControls({ maxWithdrawalAmount: v }); };
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
        withdrawalMethod,
        maxAnnualWithdrawal: maxWithdrawalAmount || undefined,
        annualSSIncome: combinedSSAnnual,
        ssStartYear,
      }),
    [accounts, annualContributions, yearsToRetirement, retirementYears, currentAge, scenario, monthlySpending, withdrawalRatePct, withdrawalMethod, maxWithdrawalAmount, combinedSSAnnual, ssStartYear]
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
          const retYear = y - yearsToRetirement;
          const age = currentAge + y + 1;
          const rateBased = portfolio * (withdrawalRatePct / 100);
          const inflatedExpense = expenseBasedWithdrawal * Math.pow(1 + scenario.inflationPct / 100, retYear);
          // Approximate RMD (assume ~60% of portfolio is tax-deferred)
          const approxTaxDeferred = portfolio * 0.6;
          const rmd = age >= 73 ? approxTaxDeferred / Math.max(5, 95 - age + 8.9) : 0;

          let withdrawal: number;
          if (withdrawalMethod === "expense") withdrawal = inflatedExpense;
          else if (withdrawalMethod === "rate") withdrawal = rateBased;
          else withdrawal = Math.max(inflatedExpense, rateBased);

          // RMDs are mandatory
          if (rmd > withdrawal) withdrawal = rmd;
          // Apply cap (but not below RMD)
          if (maxWithdrawalAmount && maxWithdrawalAmount > 0) {
            withdrawal = Math.max(rmd, Math.min(withdrawal, maxWithdrawalAmount));
          }
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
  }, [accounts, annualContributions, yearsToRetirement, retirementYears, currentAge, scenario, monthlySpending, withdrawalRatePct, withdrawalMethod, maxWithdrawalAmount, combinedSSAnnual]);

  // Chart data
  const chartData = projection.ages.map((age, i) => ({
    age,
    total: projection.totalValues[i],
    phase: projection.phases[i],
  }));

  const portfolioAtRetirement = projection.totalValues[yearsToRetirement - 1] || 0;
  const portfolioAt80 = projection.totalValues[80 - currentAge - 1] || 0;
  const portfolioAt90 = projection.totalValues[90 - currentAge - 1] || 0;
  // Calculate year-1 withdrawal using the same method as the projection engine
  const year1Expenses = monthlySpending * 12;
  const year1SS = combinedSSAnnual;
  const expenseBased = Math.max(0, year1Expenses - year1SS);
  const rateBased = portfolioAtRetirement * (withdrawalRatePct / 100);
  let annualFromPortfolio: number;
  if (withdrawalMethod === "expense") annualFromPortfolio = expenseBased;
  else if (withdrawalMethod === "rate") annualFromPortfolio = rateBased;
  else annualFromPortfolio = Math.max(expenseBased, rateBased);
  if (maxWithdrawalAmount && maxWithdrawalAmount > 0) {
    annualFromPortfolio = Math.min(annualFromPortfolio, maxWithdrawalAmount);
  }
  const monthlyFromPortfolio = Math.round(annualFromPortfolio / 12);
  const totalMonthlyRetirementIncome = monthlyFromPortfolio + selfSSMonthly + spouseSSMonthly;
  const withdrawalLabel = withdrawalMethod === "expense" ? "expense-based"
    : withdrawalMethod === "rate" ? `${withdrawalRatePct}% rate` : "higher-of-both";

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
            <Label className="text-sm font-medium flex items-center gap-1.5">Market Scenario <HelpTip text="Each scenario sets different return, volatility, and inflation assumptions. The projection uses these to model portfolio growth and withdrawal sustainability." /></Label>
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
                <Label className="text-sm flex items-center gap-1">SS Claiming Age <HelpTip text="Each year you delay past 62 increases your monthly benefit. Delaying to 70 gives ~76% more than claiming at 62. Your Full Retirement Age (FRA) is typically 67." /></Label>
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

          {/* Withdrawal Method */}
          <div className="space-y-2">
            <Label className="text-sm font-medium flex items-center gap-1.5">Withdrawal Method <HelpTip text="Controls how much you withdraw each year in retirement. Expense-based: withdraw what you need for spending minus SS. Rate-based: withdraw a % of your portfolio. Higher-of-both: use whichever amount is larger." /></Label>
            <div className="grid grid-cols-3 gap-2">
              {([
                { id: "expense" as const, name: "Expense-Based", desc: "Withdraw what you need for spending minus SS" },
                { id: "rate" as const, name: "Rate-Based", desc: "Withdraw X% of portfolio each year (4% rule)" },
                { id: "higher" as const, name: "Higher Of Both", desc: "Use the higher of expense or rate calculation" },
              ]).map((m) => (
                <button
                  key={m.id}
                  onClick={() => updateWithdrawalMethod(m.id)}
                  className={cn(
                    "rounded-lg border p-2 text-left transition-colors text-xs",
                    withdrawalMethod === m.id ? "border-primary bg-primary/5" : "hover:bg-accent/50"
                  )}
                >
                  <p className="font-medium">{m.name}</p>
                  <p className="text-muted-foreground mt-0.5 text-[10px]">{m.desc}</p>
                </button>
              ))}
            </div>
            <p className="text-[10px] text-muted-foreground">
              Note: After age 73, Required Minimum Distributions (RMDs) from tax-deferred accounts are mandatory regardless of method chosen. The withdrawal will never be less than the RMD.
            </p>
          </div>

          {/* Monthly Retirement Spending + Withdrawal Rate */}
          <div className="grid gap-6 sm:grid-cols-2">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-sm flex items-center gap-1">Monthly Spending <HelpTip text="Your expected monthly household expenses in retirement. This amount grows with inflation each year. Used by the expense-based withdrawal method to determine how much to withdraw." /></Label>
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
                <Label className="text-sm flex items-center gap-1">Withdrawal Rate <HelpTip text="The percentage of your portfolio withdrawn annually. The '4% rule' is a common guideline — withdraw 4% of your portfolio each year, and it should last 30 years in most market conditions." /></Label>
                <Badge variant="outline" className="font-mono">
                  {withdrawalRatePct}%{maxWithdrawalAmount ? ` (max ${formatCurrency(maxWithdrawalAmount)}/yr)` : ""}
                </Badge>
              </div>
              <Slider
                value={[withdrawalRatePct * 10]}
                onValueChange={(v) => updateWithdrawalRate((Array.isArray(v) ? v[0] : v) / 10)}
                min={10}
                max={80}
                step={1}
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>1% (conservative)</span>
                <span>8% (aggressive)</span>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Max annual withdrawal ($)</Label>
                <Input
                  type="number"
                  step="0.01"
                  placeholder="Unlimited (leave blank)"
                  value={maxWithdrawalAmount ?? ""}
                  onChange={(e) => {
                    const val = e.target.value ? Number(e.target.value) : null;
                    updateMaxWithdrawal(val);
                  }}
                  className="h-7 text-xs font-mono"
                />
                <p className="text-[10px] text-muted-foreground">
                  Cap the annual withdrawal at this dollar amount regardless of the rate. Blank = no cap (rate drives everything).
                </p>
              </div>
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
      <div className="grid gap-3 sm:gap-4 grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs text-muted-foreground flex items-center gap-1">Portfolio at Retirement ({retirementAge}) <HelpTip text="The projected total value of all your investment accounts at the year you retire. Accounts for contributions, employer match, salary growth, and market returns." /></CardTitle>
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
              ({formatCurrency(monthlyFromPortfolio)} {withdrawalLabel} + {formatCurrency(selfSSMonthly + spouseSSMonthly)} SS)
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
              Based on {scenario.name} ({scenario.returnPct}% return), {formatCurrency(monthlySpending)}/mo spending, {withdrawalLabel} withdrawal
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
          <div className="h-[220px] sm:h-[300px] -ml-2">
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
          <CardTitle className="flex items-center gap-1.5">Monte Carlo Simulation <HelpTip text="Runs 500 random market scenarios to estimate how often your money lasts through retirement. Each scenario uses random annual returns based on the selected market scenario's average and volatility." /></CardTitle>
          <p className="text-sm text-muted-foreground">
            500 random scenarios — {monteCarloData.successRate}% success rate (money lasts {retirementYears}+ years)
          </p>
        </CardHeader>
        <CardContent>
          <div className="h-[220px] sm:h-[300px] -ml-2">
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
                <Area type="monotone" dataKey="p90" stroke="none" fill="#22c55e" fillOpacity={0.08} name="90th %" />
                <Area type="monotone" dataKey="p75" stroke="none" fill="#22c55e" fillOpacity={0.12} name="75th %" />
                <Area type="monotone" dataKey="p25" stroke="none" fill="#22c55e" fillOpacity={0.12} name="25th %" />
                <Area type="monotone" dataKey="p10" stroke="none" fill="#22c55e" fillOpacity={0.08} name="10th %" />
                <Area type="monotone" dataKey="p50" stroke="#22c55e" fill="#22c55e" fillOpacity={0.2} strokeWidth={2.5} name="Median" dot={false} />
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
                      <TableHead className="text-right">RMD</TableHead>
                      <TableHead className="text-right">SS Income</TableHead>
                      {projection.accountProjections.map((ap) => (
                        <TableHead key={ap.name} className="text-right font-mono text-xs">
                          {ap.name}
                          {(ap.accountType === "401k" || ap.accountType === "403b" || ap.accountType === "ira_traditional" || ap.accountType === "pension") && (
                            <span className="block text-[9px] text-amber-500">RMD</span>
                          )}
                        </TableHead>
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
                            <span>-{formatCurrency(projection.withdrawals[i])}</span>
                            {projection.rmdAmounts[i] > 0 && Math.abs(projection.withdrawals[i] - projection.rmdAmounts[i]) < 100 && (
                              <Badge variant="outline" className="ml-1 text-[8px] px-1 py-0 border-amber-500/50 text-amber-500">RMD</Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs">
                            {projection.rmdAmounts[i] > 0 ? (
                              <span className="text-amber-500">{formatCurrency(projection.rmdAmounts[i])}</span>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
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
                      <TableHead className="text-right">RMD</TableHead>
                      {projection.accountProjections.map((ap) => (
                        <TableHead key={ap.name} className="text-right font-mono text-xs">{ap.name}</TableHead>
                      ))}
                      <TableHead className="text-right font-mono font-bold">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {projection.ages.map((age, i) => (
                      <TableRow key={i} className={cn(
                        i === yearsToRetirement ? "border-t-2 border-primary" : "",
                        projection.rmdAmounts[i] > 0 && projection.rmdAmounts[i] > projection.withdrawals[i] * 0.9 ? "bg-amber-500/5" : ""
                      )}>
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
                            : (
                              <div>
                                <span>-{formatCurrency(projection.withdrawals[i])}</span>
                                {projection.rmdAmounts[i] > 0 && Math.abs(projection.withdrawals[i] - projection.rmdAmounts[i]) < 100 && (
                                  <Badge variant="outline" className="ml-1 text-[8px] px-1 py-0 border-amber-500/50 text-amber-500">RMD</Badge>
                                )}
                              </div>
                            )}
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs">
                          {projection.rmdAmounts[i] > 0 ? (
                            <span className="text-amber-500">
                              {formatCurrency(projection.rmdAmounts[i])}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        {projection.accountProjections.map((ap) => (
                          <TableCell key={ap.name} className="text-right font-mono text-xs">
                            <div>{formatCurrency(ap.projectedValues[i])}</div>
                            {projection.phases[i] === "accumulation" && ap.contributionPerYear?.[i] > 0 && (
                              <div className="text-[9px] text-green-500">+{formatCurrency(ap.contributionPerYear[i])}</div>
                            )}
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
              <p className="text-[10px] text-muted-foreground mt-2">
                <span className="text-amber-500 font-medium">RMD</span> = Required Minimum Distribution from tax-deferred accounts (401k, 403b, Traditional IRA) starting at age 73. Highlighted rows indicate the RMD is driving the withdrawal amount.
              </p>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
      {/* Scenario Analysis — uses the same engine and settings as above */}
      <ScenarioAnalysis
        accounts={accounts}
        annualContributions={annualContributions}
        yearsToRetirement={yearsToRetirement}
        retirementYears={retirementYears}
        currentAge={currentAge}
        scenario={scenario}
        monthlySpending={monthlySpending}
        withdrawalRatePct={withdrawalRatePct}
        withdrawalMethod={withdrawalMethod}
        maxWithdrawalAmount={maxWithdrawalAmount}
        combinedSSAnnual={combinedSSAnnual}
        ssStartYear={ssStartYear}
        basePortfolioAtRetirement={portfolioAtRetirement}
        baseSuccessRate={monteCarloData.successRate}
      />
    </div>
  );
}

// ─── Scenario Analysis ──────────────────────────────────────────

type ScenarioAnalysisProps = {
  accounts: AccountInput[];
  annualContributions: number;
  yearsToRetirement: number;
  retirementYears: number;
  currentAge: number;
  scenario: MarketScenario;
  monthlySpending: number;
  withdrawalRatePct: number;
  withdrawalMethod: "expense" | "rate" | "higher";
  maxWithdrawalAmount: number | null;
  combinedSSAnnual: number;
  ssStartYear: number;
  basePortfolioAtRetirement: number;
  baseSuccessRate: number;
};

type ScenarioResult = {
  portfolioAtRetirement: number;
  successRate: number;
  paramValue: number;
};

const SCENARIO_DEFS = [
  {
    id: "market_crash",
    name: "Market Crash",
    description: "What if the market drops suddenly?",
    paramLabel: "Drop",
    defaultValue: 30,
    unit: "%",
  },
  {
    id: "early_retire",
    name: "Retire Earlier",
    description: "What if you retire sooner?",
    paramLabel: "Years earlier",
    defaultValue: 5,
    unit: "yrs",
  },
  {
    id: "boost_savings",
    name: "Boost Savings",
    description: "What if you increase contributions?",
    paramLabel: "Increase",
    defaultValue: 50,
    unit: "%",
  },
  {
    id: "lower_returns",
    name: "Lower Returns",
    description: "What if the market underperforms?",
    paramLabel: "Return",
    defaultValue: 4,
    unit: "%",
  },
  {
    id: "high_inflation",
    name: "High Inflation",
    description: "What if inflation stays elevated?",
    paramLabel: "Inflation",
    defaultValue: 5,
    unit: "%",
  },
  {
    id: "reduced_ss",
    name: "Reduced Social Security",
    description: "What if SS benefits are cut?",
    paramLabel: "Cut by",
    defaultValue: 25,
    unit: "%",
  },
] as const;

function ScenarioAnalysis(props: ScenarioAnalysisProps) {
  const [results, setResults] = useState<Map<string, ScenarioResult>>(new Map());
  const [paramValues, setParamValues] = useState<Record<string, number>>(
    Object.fromEntries(SCENARIO_DEFS.map((s) => [s.id, s.defaultValue]))
  );

  function runProjection(overrides: {
    accountsOverride?: AccountInput[];
    yearsToRetirementOverride?: number;
    retirementYearsOverride?: number;
    returnPctOverride?: number;
    inflationPctOverride?: number;
    ssIncomeOverride?: number;
    contributionsMultiplier?: number;
  }) {
    const accts = overrides.accountsOverride || props.accounts;
    const contribMult = overrides.contributionsMultiplier || 1;

    const proj = runDetailedProjection({
      accounts: accts.map((a) => ({
        ...a,
        annualContribution: Math.round(a.annualContribution * contribMult),
      })),
      totalAnnualContributions: props.annualContributions * contribMult,
      yearsToRetirement: overrides.yearsToRetirementOverride ?? props.yearsToRetirement,
      yearsInRetirement: overrides.retirementYearsOverride ?? props.retirementYears,
      startAge: props.currentAge,
      returnPct: overrides.returnPctOverride ?? props.scenario.returnPct,
      inflationPct: overrides.inflationPctOverride ?? props.scenario.inflationPct,
      annualExpenses: props.monthlySpending * 12,
      withdrawalRatePct: props.withdrawalRatePct,
      withdrawalMethod: props.withdrawalMethod,
      maxAnnualWithdrawal: props.maxWithdrawalAmount || undefined,
      annualSSIncome: overrides.ssIncomeOverride ?? props.combinedSSAnnual,
      ssStartYear: props.ssStartYear,
    });

    // Quick Monte Carlo for success rate
    const ytr = overrides.yearsToRetirementOverride ?? props.yearsToRetirement;
    const yir = overrides.retirementYearsOverride ?? props.retirementYears;
    const totalYears = ytr + yir;
    const meanReturn = (overrides.returnPctOverride ?? props.scenario.returnPct) / 100;
    const stdDev = props.scenario.volatility / 100;
    const inflPct = overrides.inflationPctOverride ?? props.scenario.inflationPct;
    const ssIncome = overrides.ssIncomeOverride ?? props.combinedSSAnnual;
    const expenses = props.monthlySpending * 12;
    const startVal = accts.reduce((s, a) => s + a.value, 0) *
      (overrides.accountsOverride ? 1 : 1); // accounts already adjusted if crash
    const annContrib = props.annualContributions * contribMult;

    let successes = 0;
    const numSims = 300;
    for (let sim = 0; sim < numSims; sim++) {
      let portfolio = overrides.accountsOverride
        ? overrides.accountsOverride.reduce((s, a) => s + a.value, 0)
        : accts.reduce((s, a) => s + a.value, 0);
      let survived = true;
      for (let y = 0; y < totalYears; y++) {
        const u1 = Math.random(), u2 = Math.random();
        const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
        const yearReturn = meanReturn + stdDev * z;
        const growth = portfolio * yearReturn;
        if (y < ytr) {
          portfolio += growth + annContrib;
        } else {
          const retYear = y - ytr;
          const inflatedExp = expenses * Math.pow(1 + inflPct / 100, retYear);
          const inflatedSS = (y >= props.ssStartYear ? ssIncome : 0) * Math.pow(1 + inflPct / 100, retYear);
          const need = Math.max(0, inflatedExp - inflatedSS);
          const withdrawal = props.maxWithdrawalAmount && props.maxWithdrawalAmount > 0
            ? Math.min(need, props.maxWithdrawalAmount) : need;
          portfolio = portfolio + growth - Math.min(withdrawal, portfolio + growth);
        }
        portfolio = Math.max(0, portfolio);
      }
      if (portfolio > 0) successes++;
    }

    const ytrIdx = (overrides.yearsToRetirementOverride ?? props.yearsToRetirement) - 1;
    return {
      portfolioAtRetirement: proj.totalValues[ytrIdx] || 0,
      successRate: Math.round((successes / numSims) * 100),
    };
  }

  function runScenario(scenarioId: string) {
    const value = paramValues[scenarioId];
    let result: { portfolioAtRetirement: number; successRate: number };

    switch (scenarioId) {
      case "market_crash":
        result = runProjection({
          accountsOverride: props.accounts.map((a) => ({ ...a, value: a.value * (1 - value / 100) })),
        });
        break;
      case "early_retire":
        result = runProjection({
          yearsToRetirementOverride: Math.max(0, props.yearsToRetirement - value),
          retirementYearsOverride: props.retirementYears + value,
        });
        break;
      case "boost_savings":
        result = runProjection({ contributionsMultiplier: 1 + value / 100 });
        break;
      case "lower_returns":
        result = runProjection({ returnPctOverride: value });
        break;
      case "high_inflation":
        result = runProjection({ inflationPctOverride: value });
        break;
      case "reduced_ss":
        result = runProjection({ ssIncomeOverride: props.combinedSSAnnual * (1 - value / 100) });
        break;
      default:
        return;
    }

    setResults((prev) => {
      const next = new Map(prev);
      next.set(scenarioId, { ...result, paramValue: value });
      return next;
    });
  }

  function runAll() {
    for (const s of SCENARIO_DEFS) runScenario(s.id);
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle>Scenario Analysis</CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              Uses your current settings ({props.scenario.name}, {props.withdrawalMethod} withdrawal, {props.retirementYears}yr retirement)
            </p>
          </div>
          <div className="flex gap-2 shrink-0">
            {results.size > 0 && (
              <Button variant="outline" size="sm" onClick={() => setResults(new Map())}>
                Reset
              </Button>
            )}
            <Button size="sm" onClick={runAll}>
              Run All
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {/* Base case from interactive controls */}
        <div className="mb-4 rounded-lg border bg-muted/30 border-primary/30 p-3 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <span className="font-medium text-sm">Base Case ({props.scenario.name})</span>
          <div className="flex items-center gap-6 text-sm">
            <div className="text-right">
              <p className="text-xs text-muted-foreground">At Retirement</p>
              <p className="font-mono font-medium">{formatCurrency(props.basePortfolioAtRetirement)}</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-muted-foreground">Success</p>
              <p className={cn("font-mono font-medium",
                props.baseSuccessRate >= 80 ? "text-green-500" : props.baseSuccessRate >= 60 ? "text-yellow-500" : "text-red-500"
              )}>
                {props.baseSuccessRate}%
              </p>
            </div>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {SCENARIO_DEFS.map((s) => {
            const result = results.get(s.id);
            const diff = result ? result.portfolioAtRetirement - props.basePortfolioAtRetirement : null;
            const diffPct = diff !== null && props.basePortfolioAtRetirement > 0
              ? (diff / props.basePortfolioAtRetirement) * 100 : null;

            return (
              <div key={s.id} className="rounded-lg border p-4 space-y-3">
                <span className="font-medium text-sm">{s.name}</span>
                <p className="text-xs text-muted-foreground">{s.description}</p>
                <div className="flex items-center gap-2">
                  <Label className="text-xs whitespace-nowrap">{s.paramLabel}</Label>
                  <Input
                    type="number"
                    value={paramValues[s.id]}
                    onChange={(e) => setParamValues((prev) => ({ ...prev, [s.id]: Number(e.target.value) }))}
                    className="h-7 w-20 text-xs font-mono"
                    step={s.unit === "yrs" ? 1 : 0.5}
                  />
                  <span className="text-xs text-muted-foreground">{s.unit}</span>
                </div>
                {result ? (
                  <div className="space-y-2">
                    <div className="grid grid-cols-2 gap-1 text-center">
                      <div>
                        <p className="text-[10px] text-muted-foreground">Portfolio</p>
                        <p className="font-mono text-xs font-medium">{formatCurrency(result.portfolioAtRetirement)}</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-muted-foreground">Success</p>
                        <p className={cn("font-mono text-xs font-medium",
                          result.successRate >= 80 ? "text-green-500" : result.successRate >= 60 ? "text-yellow-500" : "text-red-500"
                        )}>
                          {result.successRate}%
                        </p>
                      </div>
                    </div>
                    {diffPct !== null && (
                      <p className={cn("text-center text-xs font-mono", diff! >= 0 ? "text-green-500" : "text-red-500")}>
                        {diff! >= 0 ? "+" : ""}{formatCurrency(diff!)} ({diffPct >= 0 ? "+" : ""}{Math.round(diffPct)}%)
                      </p>
                    )}
                    <Button variant="ghost" size="sm" className="w-full h-7 text-xs" onClick={() => runScenario(s.id)}>
                      Re-run
                    </Button>
                  </div>
                ) : (
                  <Button size="sm" variant="outline" className="w-full" onClick={() => runScenario(s.id)}>
                    Run Scenario
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
