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
import { Money } from "@/components/ui/money";
import { ControlList, ControlRow } from "@/components/ui/control-row";
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
import { formatCompactCurrency, formatCurrency } from "@/lib/utils/format";
import {
  MARKET_SCENARIOS,
  adjustSSBenefit,
  runDetailedProjection,
  type DetailedProjectionParams,
} from "@/lib/utils/projection-scenarios";
import { runProjectionMonteCarlo } from "@/lib/projections/monte-carlo";
import { WHAT_IFS, whatIfParams, type WhatIfId } from "@/lib/projections/what-if";
import {
  controlsFromSaved,
  projectionInputs,
  type ProjectionHousehold,
  type SavedProjectionControls,
} from "@/lib/projections/settings";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { getIrsLimitForAge } from "@/lib/constants";
import {
  RISK_PROFILES,
  RISK_PROFILE_ORDER,
  type RiskProfileId,
  type GlidePathConfig,
  type GlideCurve,
  getGlidePathParams,
} from "@/lib/utils/glide-path";

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
  // Declared rather than relied on: these reach the engine by passing the
  // object straight through, and a type that does not mention them lets the
  // next rebuild of this object drop them silently.
  employerNonElectivePct?: number;
  employerNonElectiveAmount?: number;
  contributionFactors?: number[];
  salary: number;
  salaryGrowth: import("@/lib/utils/salary-growth").SalaryGrowthConfig | null;
  ownerRetirementYear?: number;
  ownerCurrentAge?: number;
};

type Props = {
  accounts: AccountInput[];
  currentAge: number;
  retirementAge: number;
  spouseAge: number | null;
  spouseRetirementAge: number | null;
  selfSSAtFRA: number;
  spouseSSAtFRA: number;
  selfFRA: number;
  spouseFRA: number;
  monthlyExpenses: number;
  annualContributions: number;
  riskTolerance?: "conservative" | "moderate" | "aggressive";
  savedControls?: SavedProjectionControls;
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
  spouseRetirementAge,
  selfSSAtFRA,
  spouseSSAtFRA,
  selfFRA,
  spouseFRA,
  monthlyExpenses,
  annualContributions,
  riskTolerance,
  savedControls,
}: Props) {
  // Interactive state, initialised from the saved controls by the same rules
  // the AI assistant reads them with (src/lib/projections/settings.ts).
  const household: ProjectionHousehold = useMemo(
    () => ({
      accounts, currentAge, retirementAge, spouseAge, selfSSAtFRA, spouseSSAtFRA,
      selfFRA, spouseFRA, monthlyExpenses, annualContributions, riskTolerance,
    }),
    [accounts, currentAge, retirementAge, spouseAge, selfSSAtFRA, spouseSSAtFRA, selfFRA, spouseFRA, monthlyExpenses, annualContributions, riskTolerance]
  );
  const [initial] = useState(() => controlsFromSaved(household, savedControls));
  const [selfSSAge, setSelfSSAge] = useState(initial.selfSSAge);
  const [spouseSSAge, setSpouseSSAge] = useState(initial.spouseSSAge);
  const [monthlySpending, setMonthlySpending] = useState(initial.monthlySpending);
  const [withdrawalRatePct, setWithdrawalRatePct] = useState(initial.withdrawalRatePct);
  const [withdrawalMethod, setWithdrawalMethod] = useState<"expense" | "rate" | "higher">(initial.withdrawalMethod);
  const [maxWithdrawalAmount, setMaxWithdrawalAmount] = useState<number | null>(initial.maxWithdrawalAmount);
  const [retirementYears, setRetirementYears] = useState(initial.retirementYears);
  const [selectedScenario, setSelectedScenario] = useState<string>(initial.scenarioId);

  // Glide path state
  const [gpEnabled, setGpEnabled] = useState(initial.glidePathEnabled);
  const [gpStartProfile, setGpStartProfile] = useState<RiskProfileId>(initial.glidePathStartProfile);
  const [gpEndProfile, setGpEndProfile] = useState<RiskProfileId>(initial.glidePathEndProfile);
  const [gpTransitionStartAge, setGpTransitionStartAge] = useState(initial.glidePathTransitionStartAge);
  const [gpTransitionEndAge, setGpTransitionEndAge] = useState(initial.glidePathTransitionEndAge);
  const [gpCurve, setGpCurve] = useState<GlideCurve>(initial.glidePathCurve);

  // Catch-up contributions toggle (defaults to on)
  const [catchUpEnabled, setCatchUpEnabled] = useState(initial.catchUpEnabled);
  const updateCatchUpEnabled = (v: boolean) => { setCatchUpEnabled(v); saveControls({ catchUpEnabled: v }); };


  // Wrapper functions that update state AND persist
  const updateSelfSSAge = (v: number) => { setSelfSSAge(v); saveControls({ ssClaimAgeSelf: v }); };
  const updateSpouseSSAge = (v: number) => { setSpouseSSAge(v); saveControls({ ssClaimAgeSpouse: v }); };
  const updateSpending = (v: number) => { setMonthlySpending(v); saveControls({ monthlySpending: v }); };
  const updateWithdrawalRate = (v: number) => { setWithdrawalRatePct(v); saveControls({ withdrawalRate: v }); };
  const updateWithdrawalMethod = (v: "expense" | "rate" | "higher") => { setWithdrawalMethod(v); saveControls({ withdrawalMethod: v }); };
  const updateMaxWithdrawal = (v: number | null) => { setMaxWithdrawalAmount(v); saveControls({ maxWithdrawalAmount: v }); };
  const updateRetirementYears = (v: number) => { setRetirementYears(v); saveControls({ retirementYears: v }); };
  const updateScenario = (v: string) => { setSelectedScenario(v); saveControls({ marketScenario: v }); };

  // Glide path update functions
  const updateGpEnabled = (v: boolean) => { setGpEnabled(v); saveControls({ glidePathEnabled: v }); };
  const updateGpStartProfile = (v: RiskProfileId) => { setGpStartProfile(v); saveControls({ glidePathStartProfile: v }); };
  const updateGpEndProfile = (v: RiskProfileId) => { setGpEndProfile(v); saveControls({ glidePathEndProfile: v }); };
  const updateGpTransitionStartAge = (v: number) => { setGpTransitionStartAge(v); saveControls({ glidePathTransitionStartAge: v }); };
  const updateGpTransitionEndAge = (v: number) => { setGpTransitionEndAge(v); saveControls({ glidePathTransitionEndAge: v }); };
  const updateGpCurve = (v: GlideCurve) => { setGpCurve(v); saveControls({ glidePathCurve: v }); };

  // Everything the engine needs, from the household and the controls on
  // screen. The assistant builds its inputs with the same function.
  const inputs = useMemo(
    () =>
      projectionInputs(household, {
        selfSSAge, spouseSSAge, monthlySpending, withdrawalRatePct, withdrawalMethod,
        maxWithdrawalAmount, retirementYears, scenarioId: selectedScenario,
        glidePathEnabled: gpEnabled, glidePathStartProfile: gpStartProfile, glidePathEndProfile: gpEndProfile,
        glidePathTransitionStartAge: gpTransitionStartAge, glidePathTransitionEndAge: gpTransitionEndAge,
        glidePathCurve: gpCurve, catchUpEnabled,
      }),
    [household, selfSSAge, spouseSSAge, monthlySpending, withdrawalRatePct, withdrawalMethod, maxWithdrawalAmount, retirementYears, selectedScenario, gpEnabled, gpStartProfile, gpEndProfile, gpTransitionStartAge, gpTransitionEndAge, gpCurve, catchUpEnabled]
  );
  const {
    scenario, glidePath: glidePathConfig, selfSSMonthly, spouseSSMonthly,
    yearsToRetirement,
  } = inputs;

  // Spouse retires at a different age — calculate what your age is when they retire
  const spouseRetireAtYourAge = (spouseAge && spouseRetirementAge)
    ? currentAge + Math.max(0, spouseRetirementAge - spouseAge)
    : null;
  // Are retirements staggered?
  const hasStaggeredRetirement = spouseRetireAtYourAge !== null && spouseRetireAtYourAge !== retirementAge;

  // Run deterministic projection
  const projection = useMemo(() => runDetailedProjection(inputs.params), [inputs]);

  // The odds, from the same engine run against 500 seeded markets. Seeded, so
  // the server and the browser draw the same markets and agree on the result.
  const monteCarloData = useMemo(
    () => runProjectionMonteCarlo(inputs.params, { volatilityPct: inputs.volatilityPct, simulations: 500 }),
    [inputs]
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
  // The first year of retirement, read from the engine and restated in
  // today's dollars so it compares with the spending entered above. The page
  // used to estimate this itself, setting Social Security in today's dollars
  // against a withdrawal from the balance at retirement in future dollars,
  // and with the default method its surplus was zero by construction.
  const firstRetirementYear = yearsToRetirement < projection.years.length ? yearsToRetirement : -1;
  const inTodaysDollars = (v: number) =>
    firstRetirementYear >= 0 ? v / projection.priceLevel[firstRetirementYear] : 0;
  const monthlySS = firstRetirementYear >= 0
    ? Math.round(inTodaysDollars(projection.ssIncomeNominal[firstRetirementYear]) / 12)
    : 0;
  // What savings pay towards spending: the withdrawal less its tax and less
  // any required distribution that was reinvested rather than spent.
  const monthlyFromPortfolio = firstRetirementYear >= 0
    ? Math.round(
        inTodaysDollars(
          projection.withdrawals[firstRetirementYear] -
            projection.taxes[firstRetirementYear] -
            projection.reinvested[firstRetirementYear]
        ) / 12
      )
    : 0;
  const monthlyIncome = monthlyFromPortfolio + monthlySS;
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

  // One definition, read by both the phone cards and the desktop table.
  const MILESTONES = [
    { label: "Today", idx: -1 },
    { label: `Retire (${retirementAge})`, idx: yearsToRetirement - 1 },
    { label: "Age 70", idx: 70 - currentAge - 1 },
    { label: "Age 75", idx: 75 - currentAge - 1 },
    { label: "Age 80", idx: 80 - currentAge - 1 },
    { label: "Age 85", idx: 85 - currentAge - 1 },
    { label: "Age 90", idx: 90 - currentAge - 1 },
    { label: "Age 95", idx: 95 - currentAge - 1 },
  ].filter((m) => m.idx < projection.totalValues.length);

  // Shown inside each control sheet so an adjustment and its consequence are
  // on screen together.
  const liveResult = (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="text-muted-foreground">
        At {retirementAge}{" "}
        <span className="font-mono font-semibold text-foreground">
          <Money value={portfolioAtRetirement} />
        </span>
      </span>
      <span
        className={cn(
          "font-semibold",
          portfolioLastsFullPeriod ? "text-green-500" : "text-red-500"
        )}
      >
        {portfolioLastsFullPeriod
          ? `Lasts to ${retirementAge + retirementYears}`
          : `Runs out at ${portfolioRunsOutAge}`}
      </span>
    </div>
  );

  const verdictLine = portfolioLastsFullPeriod
    ? `Lasts to ${retirementAge + retirementYears}`
    : `Runs out at ${portfolioRunsOutAge}`;

  return (
    // A flex column rather than a stack of siblings so the phone can put the
    // answer above the knobs. On a wide screen the controls sit beside the
    // results and reading order is fine; stacked, "adjust these inputs" is the
    // first thing on screen and the number you came for is two screens down.
    <div className="flex flex-col gap-6">
      {/* The figure that moves when you move a slider, kept on screen while
          you are in the controls below. This is what makes the page usable on
          a phone: without it, every adjustment is a scroll away from its own
          result. */}
      <div className="sticky-under-header z-20 -order-3 -mx-3 border-y bg-background/95 px-3 py-2 backdrop-blur-sm sm:-mx-4 sm:px-4 lg:hidden">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
              At {retirementAge}
            </p>
            <p className="truncate font-mono text-base font-bold">
              <Money value={portfolioAtRetirement} />
            </p>
          </div>
          <div className="min-w-0 text-right">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
              Money
            </p>
            <p
              className={cn(
                "truncate text-base font-bold",
                portfolioLastsFullPeriod ? "text-green-500" : "text-red-500"
              )}
            >
              {verdictLine}
            </p>
          </div>
        </div>
      </div>

      {/* Controls */}
      <Card className="-order-1 lg:order-none">
        <CardHeader className="pb-3">
          <CardTitle>Projection Controls</CardTitle>
          <p className="text-sm text-muted-foreground">
            Adjust these inputs to see how they affect your retirement
          </p>
        </CardHeader>
        <CardContent>
        <ControlList>
          <ControlRow label="Market scenario" value={scenario.name} hint="Return, volatility and inflation assumptions used for the projection." live={liveResult}>
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

          </ControlRow>
          <ControlRow label="Social Security" value={`You ${selfSSAge} · Spouse ${spouseSSAge}`} hint="Each year you delay past 62 raises the monthly benefit." live={liveResult}>
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

          </ControlRow>
          <ControlRow label="Withdrawal method" value={withdrawalLabel} hint="How much comes out of the portfolio each year in retirement." live={liveResult}>
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

          </ControlRow>
          <ControlRow label="Spending & rate" value={`${formatCompactCurrency(monthlySpending)}/mo · ${withdrawalRatePct}%`} hint="What you expect to spend, and the ceiling on withdrawals." live={liveResult}>
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

          </ControlRow>
          {/* Three settings most people set once and never touch again. They
              were between the reader and the answer on every visit; behind a
              disclosure they are still one tap away. */}
          <details className="group rounded-lg border">
            <summary className="flex cursor-pointer select-none items-center justify-between gap-2 px-3 py-2.5 text-sm font-medium">
              More assumptions
              <span className="text-xs font-normal text-muted-foreground">
                {retirementYears} yrs · catch-up {catchUpEnabled ? "on" : "off"} · glide path {gpEnabled ? "on" : "off"}
              </span>
            </summary>
            <div className="space-y-6 border-t p-3">
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

            {/* Catch-Up Contributions */}
            <div className="flex items-center justify-between rounded-lg border p-4">
              <div className="space-y-0.5">
                <Label className="text-sm font-medium flex items-center gap-1.5">
                  Catch-Up Contributions
                  <HelpTip text="When enabled, the projection increases IRS contribution caps when account owners turn 50 (+$7,500/yr for 401k) and applies the SECURE 2.0 enhanced catch-up at ages 60-63 (+$11,250/yr for 401k). Disable if you don't plan to increase contributions at those milestones." />
                </Label>
                <p className="text-xs text-muted-foreground">
                  {catchUpEnabled
                    ? "50+ and 60-63 enhanced IRS limits applied automatically"
                    : "Using standard under-50 IRS limits for all years"}
                </p>
              </div>
              <Switch
                checked={catchUpEnabled}
                onCheckedChange={updateCatchUpEnabled}
              />
            </div>

            {/* Risk Glide Path */}
            <div className="space-y-4 rounded-lg border p-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="text-sm font-medium flex items-center gap-1.5">
                    Risk Glide Path
                    <HelpTip text="Gradually shifts your portfolio from aggressive to conservative as you approach retirement — like a target-date fund. This reduces volatility near retirement to protect against large downswings (sequence-of-returns risk)." />
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Automatically reduce risk as you approach retirement
                  </p>
                </div>
                <Switch
                  checked={gpEnabled}
                  onCheckedChange={updateGpEnabled}
                />
              </div>

              {gpEnabled && (
                <div className="space-y-4 pt-2">
                  {/* Start and End Risk Profiles */}
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Starting Risk Level</Label>
                      <Select value={gpStartProfile} onValueChange={(v) => updateGpStartProfile(v as RiskProfileId)}>
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {RISK_PROFILE_ORDER.map((id) => (
                            <SelectItem key={id} value={id} className="text-xs">
                              {RISK_PROFILES[id].label} — {RISK_PROFILES[id].description}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="text-[10px] text-muted-foreground">
                        {RISK_PROFILES[gpStartProfile].returnPct}% return, {RISK_PROFILES[gpStartProfile].volatility}% volatility
                      </p>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Target Risk Level</Label>
                      <Select value={gpEndProfile} onValueChange={(v) => updateGpEndProfile(v as RiskProfileId)}>
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {RISK_PROFILE_ORDER.map((id) => (
                            <SelectItem key={id} value={id} className="text-xs">
                              {RISK_PROFILES[id].label} — {RISK_PROFILES[id].description}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="text-[10px] text-muted-foreground">
                        {RISK_PROFILES[gpEndProfile].returnPct}% return, {RISK_PROFILES[gpEndProfile].volatility}% volatility
                      </p>
                    </div>
                  </div>

                  {/* Transition Age Range */}
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs">Transition Start Age</Label>
                        <Badge variant="outline" className="font-mono text-[10px]">{gpTransitionStartAge}</Badge>
                      </div>
                      <Slider
                        value={[gpTransitionStartAge]}
                        onValueChange={(v) => updateGpTransitionStartAge(Array.isArray(v) ? v[0] : v)}
                        min={currentAge}
                        max={Math.max(currentAge + 1, gpTransitionEndAge - 1)}
                        step={1}
                      />
                      <p className="text-[10px] text-muted-foreground">
                        When to begin shifting allocation
                      </p>
                    </div>
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs">Transition End Age</Label>
                        <Badge variant="outline" className="font-mono text-[10px]">{gpTransitionEndAge}</Badge>
                      </div>
                      <Slider
                        value={[gpTransitionEndAge]}
                        onValueChange={(v) => updateGpTransitionEndAge(Array.isArray(v) ? v[0] : v)}
                        min={gpTransitionStartAge + 1}
                        max={retirementAge + 10}
                        step={1}
                      />
                      <p className="text-[10px] text-muted-foreground">
                        When transition completes (can extend past retirement)
                      </p>
                    </div>
                  </div>

                  {/* Curve Shape */}
                  <div className="space-y-1.5">
                    <Label className="text-xs">Transition Curve</Label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => updateGpCurve("linear")}
                        className={cn(
                          "rounded-lg border p-2 text-left transition-colors text-xs",
                          gpCurve === "linear" ? "border-primary bg-primary/5" : "hover:bg-accent/50"
                        )}
                      >
                        <p className="font-medium">Linear</p>
                        <p className="text-[10px] text-muted-foreground">Steady, even shift over time</p>
                      </button>
                      <button
                        onClick={() => updateGpCurve("accelerated")}
                        className={cn(
                          "rounded-lg border p-2 text-left transition-colors text-xs",
                          gpCurve === "accelerated" ? "border-primary bg-primary/5" : "hover:bg-accent/50"
                        )}
                      >
                        <p className="font-medium">Accelerated</p>
                        <p className="text-[10px] text-muted-foreground">Slow start, faster shift near end</p>
                      </button>
                    </div>
                  </div>

                  {/* Inline Glide Path Preview Chart */}
                  <div className="space-y-1.5">
                    <Label className="text-xs">Allocation Over Time</Label>
                    <div className="h-[100px] rounded-lg border bg-muted/20 p-2">
                      <GlidePathPreview
                        config={glidePathConfig!}
                        currentAge={currentAge}
                        retirementAge={retirementAge}
                        retirementYears={retirementYears}
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
            </div>
          </details>
        </ControlList>
        </CardContent>
      </Card>

      {/* Summary Cards — all reactive to slider controls */}
      <div className="-order-2 grid grid-cols-2 gap-3 sm:gap-4 lg:order-none lg:grid-cols-3 xl:grid-cols-5">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs text-muted-foreground flex items-center gap-1">Portfolio at Retirement ({retirementAge}) <HelpTip text="The projected total value of all your investment accounts at the year you retire. Accounts for contributions, employer match, salary growth, and market returns." /></CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xl font-bold font-mono"><Money value={portfolioAtRetirement} /></p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs text-muted-foreground flex items-center gap-1">First Year of Retirement <HelpTip text="The engine's first retirement year, in today's dollars so it compares with your spending: Social Security plus what savings pay after federal tax." /></CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">
              Spending: <span className="font-mono text-foreground"><Money value={monthlySpending} /></span>/mo
            </p>
            <p className="text-xs text-muted-foreground">
              Income: <span className="font-mono text-foreground"><Money value={monthlyIncome} /></span>/mo
            </p>
            {/* The split between savings and Social Security is detail, not
                headline — it stays out of the way until there is room. */}
            <p className="mt-1 hidden text-xs sm:block">
              {`(${formatCurrency(monthlyFromPortfolio)} from savings after tax + ${formatCurrency(monthlySS)} Social Security, today's dollars)`}
            </p>
            {monthlyIncome >= monthlySpending ? (
              <p className="text-xs text-green-500 font-medium mt-1">
                {monthlyIncome > monthlySpending ? (
                  <>+<Money value={monthlyIncome - monthlySpending} /> surplus</>
                ) : (
                  "Spending covered"
                )}
              </p>
            ) : (
              <p className="text-xs text-red-500 font-medium mt-1">
                -<Money value={monthlySpending - monthlyIncome} /> shortfall
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
              <Money value={portfolioAt80} />
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs text-muted-foreground">Portfolio at 90</CardTitle>
          </CardHeader>
          <CardContent>
            <p className={cn("text-xl font-bold font-mono", portfolioAt90 > 0 ? "" : "text-red-500")}>
              <Money value={portfolioAt90} />
            </p>
            {portfolioAt90 <= 0 && (
              <p className="text-xs text-red-500">Money runs out before 90</p>
            )}
          </CardContent>
        </Card>

        {/* Will It Last? Card */}
        <Card className={cn(
          // "Will it last" is the question the page exists to answer, so on a
          // phone it leads the row at full width instead of being the fifth
          // card in reading order.
          "order-first col-span-2 border-2 lg:order-none lg:col-span-1",
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
                  <Money value={portfolioAtEnd} /> remaining at end
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
              Based on {scenario.name} ({scenario.returnPct}% return), <Money value={monthlySpending} />/mo spending, {withdrawalLabel} withdrawal
              {gpEnabled && (
                <span className="text-primary"> + glide path ({RISK_PROFILES[gpStartProfile].label} → {RISK_PROFILES[gpEndProfile].label})</span>
              )}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Projection Chart */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2">
            Portfolio Projection — {scenario.name}
            {gpEnabled && <Badge variant="outline" className="text-[10px] font-normal">Glide Path</Badge>}
          </CardTitle>
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
                {hasStaggeredRetirement ? (
                  <>
                    {/* Stacked rather than both centred on the line: at a
                        phone's width the two labels land on top of each other
                        and render as one unreadable smear. */}
                    <ReferenceLine x={Math.min(retirementAge, spouseRetireAtYourAge!)} stroke="hsl(var(--muted-foreground))" strokeDasharray="5 5" label={{ value: spouseRetireAtYourAge! < retirementAge ? "Spouse retires" : "You retire", position: "insideTopLeft", fill: "hsl(var(--muted-foreground))", fontSize: 9 }} />
                    <ReferenceLine x={Math.max(retirementAge, spouseRetireAtYourAge!)} stroke="hsl(var(--muted-foreground))" strokeDasharray="3 3" strokeOpacity={0.5} label={{ value: spouseRetireAtYourAge! < retirementAge ? "You retire" : "Spouse retires", position: "insideBottomLeft", fill: "hsl(var(--muted-foreground))", fontSize: 9 }} />
                  </>
                ) : (
                  <ReferenceLine x={retirementAge} stroke="hsl(var(--muted-foreground))" strokeDasharray="5 5" label={{ value: "Retire", fill: "hsl(var(--muted-foreground))", fontSize: 10 }} />
                )}
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
            {gpEnabled && " — volatility decreases as glide path shifts to conservative"}
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
                {hasStaggeredRetirement ? (
                  <>
                    <ReferenceLine x={Math.min(retirementAge, spouseRetireAtYourAge!)} stroke="hsl(var(--muted-foreground))" strokeDasharray="5 5" />
                    <ReferenceLine x={Math.max(retirementAge, spouseRetireAtYourAge!)} stroke="hsl(var(--muted-foreground))" strokeDasharray="3 3" strokeOpacity={0.5} />
                  </>
                ) : (
                  <ReferenceLine x={retirementAge} stroke="hsl(var(--muted-foreground))" strokeDasharray="5 5" />
                )}
                <Area type="monotone" dataKey="p90" stroke="none" fill="#22c55e" fillOpacity={0.08} name="90th %" />
                <Area type="monotone" dataKey="p75" stroke="none" fill="#22c55e" fillOpacity={0.12} name="75th %" />
                <Area type="monotone" dataKey="p25" stroke="none" fill="#22c55e" fillOpacity={0.12} name="25th %" />
                <Area type="monotone" dataKey="p10" stroke="none" fill="#22c55e" fillOpacity={0.08} name="10th %" />
                <Area type="monotone" dataKey="p50" stroke="#22c55e" fill="#22c55e" fillOpacity={0.2} strokeWidth={2.5} name="Median" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          {/* Three columns of seven-figure currency do not fit a phone; the
              range in particular wrapped into three lines of digits. Two
              columns with the range on its own row below reads in one pass. */}
          <div className="mt-3 grid grid-cols-2 gap-4 text-center sm:grid-cols-3">
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
              <p className="font-mono font-medium"><Money value={monteCarloData.medianAtRetirement} /></p>
            </div>
            <div className="col-span-2 sm:col-span-1">
              <p className="text-xs text-muted-foreground">Range (10th-90th)</p>
              <p className="font-mono text-sm whitespace-nowrap">
                <Money value={monteCarloData.worstCase} /> — <Money value={monteCarloData.bestCase} />
              </p>
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
            {/* Four labels need about 520px. Rather than shrink them to
                illegibility, the strip scrolls. */}
            <TabsList className="mb-4 max-w-full justify-start overflow-x-auto">
              <TabsTrigger value="milestones">Key Milestones</TabsTrigger>
              <TabsTrigger value="accumulation">Accumulation (5yr)</TabsTrigger>
              <TabsTrigger value="drawdown">Drawdown (5yr)</TabsTrigger>
              <TabsTrigger value="yearly">Year-by-Year</TabsTrigger>
            </TabsList>

            {/* Key Milestones */}
            <TabsContent value="milestones">
              {/* On a phone the same data is one card per milestone: the total
                  is what you are looking for, and the per-account split reads
                  down the card instead of off the side of a table nobody can
                  see the right-hand end of. */}
              <div className="space-y-2 sm:hidden">
                {MILESTONES.map((milestone) => (
                  <div key={milestone.label} className="rounded-lg border p-3">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-sm font-medium">{milestone.label}</span>
                      <span className="font-mono text-base font-bold">
                        <Money
                          value={
                            milestone.idx === -1
                              ? accounts.reduce((sum, a) => sum + a.value, 0)
                              : projection.totalValues[milestone.idx] || 0
                          }
                        />
                      </span>
                    </div>
                    <dl className="mt-2 space-y-0.5 border-t pt-2">
                      {projection.accountProjections.map((ap) => (
                        <div key={ap.name} className="flex justify-between gap-2 text-xs">
                          <dt className="min-w-0 truncate text-muted-foreground">{ap.name}</dt>
                          <dd className="shrink-0 font-mono">
                            <Money
                              value={
                                milestone.idx === -1
                                  ? ap.currentValue
                                  : ap.projectedValues[milestone.idx] || 0
                              }
                            />
                          </dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                ))}
              </div>

              <div className="hidden overflow-x-auto rounded-lg border sm:block">
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
                    {MILESTONES.map((milestone) => (
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
                            {projection.taxes[i] > 0 && (
                              <div className="text-[10px] text-muted-foreground">
                                incl. {formatCurrency(projection.taxes[i])} tax
                                {projection.reinvested[i] > 0 && `, ${formatCurrency(projection.reinvested[i])} reinvested`}
                              </div>
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
                            +{formatCurrency(projection.ssIncomeNominal[i])}
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
                                {projection.taxes[i] > 0 && (
                                  <div className="text-[10px] text-muted-foreground">
                                    incl. {formatCurrency(projection.taxes[i])} tax
                                    {projection.reinvested[i] > 0 && `, ${formatCurrency(projection.reinvested[i])} reinvested`}
                                  </div>
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
        baseParams={inputs.params}
        volatilityPct={inputs.volatilityPct}
        scenarioName={scenario.name}
        basePortfolioAtRetirement={portfolioAtRetirement}
        baseSuccessRate={monteCarloData.successRate}
      />
    </div>
  );
}

// ─── Scenario Analysis ──────────────────────────────────────────

type ScenarioAnalysisProps = {
  /** The page's own engine inputs; each scenario changes one thing. */
  baseParams: DetailedProjectionParams;
  volatilityPct: number;
  scenarioName: string;
  basePortfolioAtRetirement: number;
  baseSuccessRate: number;
};

type ScenarioResult = {
  portfolioAtRetirement: number;
  successRate: number;
  paramValue: number;
};


function ScenarioAnalysis(props: ScenarioAnalysisProps) {
  const [results, setResults] = useState<Map<string, ScenarioResult>>(new Map());
  const [paramValues, setParamValues] = useState<Record<string, number>>(
    Object.fromEntries(WHAT_IFS.map((s) => [s.id, s.defaultValue]))
  );

  function runScenario(scenarioId: WhatIfId) {
    const value = paramValues[scenarioId];
    const params = whatIfParams(props.baseParams, scenarioId, value);
    const proj = runDetailedProjection(params);
    // Same engine, same seeded markets as the page's own odds, so a scenario
    // differs from the base case only by what the scenario changes.
    const odds = runProjectionMonteCarlo(params, { volatilityPct: props.volatilityPct, simulations: 500 });
    const result = {
      portfolioAtRetirement: proj.totalValues[params.yearsToRetirement - 1] || 0,
      successRate: odds.successRate,
    };

    setResults((prev) => {
      const next = new Map(prev);
      next.set(scenarioId, { ...result, paramValue: value });
      return next;
    });
  }

  function runAll() {
    for (const s of WHAT_IFS) runScenario(s.id);
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle>Scenario Analysis</CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              Uses your current settings ({props.scenarioName}, {props.baseParams.withdrawalMethod} withdrawal, {props.baseParams.yearsInRetirement}yr retirement)
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
          <span className="font-medium text-sm">Base Case ({props.scenarioName})</span>
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
          {WHAT_IFS.map((s) => {
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

// ─── Glide Path Preview ──────────────────────────────────────────

function GlidePathPreview({
  config,
  currentAge,
  retirementAge,
  retirementYears,
}: {
  config: GlidePathConfig;
  currentAge: number;
  retirementAge: number;
  retirementYears: number;
}) {
  const endAge = retirementAge + retirementYears;
  const data = useMemo(() => {
    const points: { age: number; stocks: number; bonds: number; returnPct: number }[] = [];
    for (let age = currentAge; age <= endAge; age++) {
      const params = getGlidePathParams(age, config);
      points.push({
        age,
        stocks: Math.round(params.stockPct),
        bonds: Math.round(100 - params.stockPct),
        returnPct: Math.round(params.returnPct * 10) / 10,
      });
    }
    return points;
  }, [config, currentAge, endAge]);

  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top: 2, right: 4, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="gpStocks" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#6366f1" stopOpacity={0.5} />
            <stop offset="100%" stopColor="#6366f1" stopOpacity={0.1} />
          </linearGradient>
          <linearGradient id="gpBonds" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#22c55e" stopOpacity={0.5} />
            <stop offset="100%" stopColor="#22c55e" stopOpacity={0.1} />
          </linearGradient>
        </defs>
        <XAxis
          dataKey="age"
          tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 9 }}
          axisLine={false}
          tickLine={false}
          interval={Math.max(1, Math.floor((endAge - currentAge) / 6))}
        />
        <YAxis
          domain={[0, 100]}
          tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 9 }}
          axisLine={false}
          tickLine={false}
          width={28}
          tickFormatter={(v) => `${v}%`}
        />
        <Tooltip
          formatter={(value, name) => [`${value}%`, name === "stocks" ? "Stocks" : "Bonds"]}
          labelFormatter={(age) => {
            const point = data.find((d) => d.age === age);
            return `Age ${age} — ${point?.returnPct}% expected return`;
          }}
          contentStyle={{
            backgroundColor: "hsl(var(--card))",
            border: "1px solid hsl(var(--border))",
            borderRadius: "6px",
            fontSize: "11px",
            padding: "4px 8px",
          }}
        />
        <ReferenceLine
          x={retirementAge}
          stroke="hsl(var(--muted-foreground))"
          strokeDasharray="3 3"
          strokeOpacity={0.5}
        />
        <Area
          type="monotone"
          dataKey="stocks"
          stackId="1"
          stroke="#6366f1"
          fill="url(#gpStocks)"
          strokeWidth={1.5}
          name="stocks"
        />
        <Area
          type="monotone"
          dataKey="bonds"
          stackId="1"
          stroke="#22c55e"
          fill="url(#gpBonds)"
          strokeWidth={1.5}
          name="bonds"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
