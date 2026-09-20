"use client";

import { useCallback, useMemo } from "react";
import {
  BarChart, Bar, AreaChart, Area, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Cell, Legend,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { formatCurrency, formatPercent, formatCompactCurrency } from "@/lib/utils/format";
import {
  projectRMDs,
  RMD_START_AGE,
  calculateRothConversionLadder,
  calculateSSBreakEven,
  calculateCatchUpImpact,
  calculateIncomeReplacement,
  calculateFeeImpact,
  calculateSequenceRisk,
  projectHealthcareCosts,
  estimateTaxMFJ,
  getMarginalRate,
} from "@/lib/utils/financial-analytics";
import type { TaxTable } from "@/lib/tax/table";
import { cn } from "@/lib/utils";
import { RETURN_BY_RISK } from "@/lib/utils/risk";

type Props = {
  currentAge: number;
  retirementAge: number;
  spouseAge: number | null;
  spouseRetirementAge: number | null;
  selfSalary: number;
  spouseSalary: number;
  selfSSAtFRA: number;
  spouseSSAtFRA: number;
  selfFRA: number;
  spouseFRA: number;
  taxDeferredBalance: number;
  taxFreeBalance: number;
  taxableBalance: number;
  holdings: { ticker: string; currentValue: number }[];
  riskTolerance: string;
  monthlyExpenses: number;
  /**
   * Balances at retirement, from the projection engine on the server.
   *
   * This component used to derive them itself with a flat annuity — no
   * salary growth, no contribution pauses, no employer non-elective money,
   * no IRS deferral cap — so it disagreed with the projections page about
   * the same household. They now come from one place.
   */
  projectedTaxDeferred: number;
  projectedTaxFree: number;
  projectedPortfolio: number;
  /**
   * The federal figures every tax number below is computed with, loaded
   * from tax_reference on the server.
   *
   * Passed in rather than imported, so this component cannot silently keep
   * computing with last year's brackets after the table is refreshed — and
   * so the year shown in the badge above is provably the year used here.
   */
  taxTable: TaxTable;
};

export function AnalyticsDashboard(props: Props) {
  const {
    currentAge, retirementAge, spouseAge, selfSalary, spouseSalary,
    selfSSAtFRA, spouseSSAtFRA, selfFRA, spouseFRA,
    taxDeferredBalance, taxFreeBalance, taxableBalance,
    holdings, riskTolerance, monthlyExpenses,
    projectedTaxDeferred, projectedTaxFree, projectedPortfolio, taxTable,
  } = props;

  const returnPct = RETURN_BY_RISK[riskTolerance] ?? 7;
  const yearsToRetirement = Math.max(0, retirementAge - currentAge);

  // 1. RMD Projections
  const rmds = useMemo(() => projectRMDs({
    taxDeferredBalance: projectedTaxDeferred,
    currentAge: retirementAge,
    returnPct,
    yearsToProject: 30,
    startYear: new Date().getFullYear() + yearsToRetirement,
    // By 73 Social Security is being claimed, so the distribution stacks on
    // top of it rather than being the household's only income.
    otherTaxableIncome: (selfSSAtFRA + spouseSSAtFRA) * 12 * 0.85,
    taxTable,
  }), [projectedTaxDeferred, retirementAge, returnPct, yearsToRetirement, selfSSAtFRA, spouseSSAtFRA, taxTable]);

  /**
   * The first year an RMD is actually required.
   *
   * The three figures below used rmds[0], which is the row at RETIREMENT age
   * — the age the projection starts from, not the age RMDs begin. So "First
   * RMD (Age 73)" read $0 because at 62 no distribution is required, and
   * "Projected Tax-Deferred at 73" showed the balance at retirement,
   * understated by however many years of growth sit between the two.
   *
   * Both were labelled with an age they did not describe, which is the kind
   * of wrong that looks right: the number is real, it is just from a
   * different year.
   */
  const firstRmd = useMemo(
    () => rmds.find((r) => r.age >= RMD_START_AGE) ?? null,
    [rmds]
  );

  /**
   * 2. Roth Conversion Ladder
   *
   * Two corrections, both the same shape as the RMD one above.
   *
   * The balances are the PROJECTED ones. This passed today's figures while
   * the conversion window does not open until retirement, so the ladder
   * started from a balance missing every year of growth and contribution
   * between now and then — and openly disagreed with the RMD tab beside it
   * about the same account.
   *
   * And Social Security is counted only once it is actually being claimed.
   * Treating it as income in every conversion year fills the bracket that
   * the strategy exists to exploit: the gap between retiring and claiming is
   * precisely when conversions are cheapest, and assuming income there
   * understated the room in the years that matter most.
   */
  // Hoisted out of the memo: a closure built inside one cannot be memoised,
  // and the two values it needs are a multiply and a max.
  const ssAnnualTaxable = (selfSSAtFRA + spouseSSAtFRA) * 12 * 0.85;
  const ssClaimAge = Math.max(selfFRA, retirementAge);
  const otherIncomeAtAge = useCallback(
    (age: number) => (age >= ssClaimAge ? ssAnnualTaxable : 0),
    [ssClaimAge, ssAnnualTaxable]
  );

  const rothLadder = useMemo(() => calculateRothConversionLadder({
    currentAge, retirementAge, rmdStartAge: RMD_START_AGE,
    taxDeferredBalance: projectedTaxDeferred,
    rothBalance: projectedTaxFree,
    otherTaxableIncomeForAge: otherIncomeAtAge,
    returnPct, targetBracketRate: 0.22,
    startYear: new Date().getFullYear(),
    taxTable,
  }), [currentAge, retirementAge, projectedTaxDeferred, projectedTaxFree, otherIncomeAtAge, returnPct, taxTable]);

  // 3. SS Break-Even
  const selfSSBreakEven = useMemo(() => calculateSSBreakEven(selfSSAtFRA, selfFRA), [selfSSAtFRA, selfFRA]);
  const spouseSSBreakEven = useMemo(() => calculateSSBreakEven(spouseSSAtFRA, spouseFRA), [spouseSSAtFRA, spouseFRA]);

  // 4. Catch-Up Impact
  const catchUp401k = useMemo(() => calculateCatchUpImpact({
    currentAge, retirementAge, returnPct, accountType: "401k",
  }), [currentAge, retirementAge, returnPct]);

  // 5. Income Replacement
  const incomeReplacement = useMemo(() => calculateIncomeReplacement({
    selfSalary, spouseSalary, portfolioAtRetirement: projectedPortfolio,
    withdrawalRate: 4, selfSSMonthly: selfSSAtFRA, spouseSSMonthly: spouseSSAtFRA,
    pensionMonthly: 0,
  }), [selfSalary, spouseSalary, projectedPortfolio, selfSSAtFRA, spouseSSAtFRA]);

  // 6. Fee Impact
  const feeImpact = useMemo(() => calculateFeeImpact(holdings.map((h) => ({
    ticker: h.ticker, currentValue: h.currentValue,
  })), returnPct), [holdings, returnPct]);

  // 7. Sequence of Returns
  const sequenceRisk = useMemo(() => calculateSequenceRisk({
    portfolioAtRetirement: projectedPortfolio,
    // Floored at zero: Social Security larger than spending is a surplus,
    // not a negative withdrawal that quietly grows the portfolio.
    annualWithdrawal: Math.max(
      0,
      monthlyExpenses * 12 - (selfSSAtFRA + spouseSSAtFRA) * 12
    ),
    years: 30,
    inflationPct: 3,
  }), [projectedPortfolio, monthlyExpenses, selfSSAtFRA, spouseSSAtFRA]);

  // 8. Healthcare Costs
  const healthcareCosts = useMemo(() => projectHealthcareCosts({
    currentAge, retirementAge, yearsToProject: 30,
    annualRetirementIncome: projectedPortfolio * 0.04 + (selfSSAtFRA + spouseSSAtFRA) * 12,
    inflationPct: 3,
    taxTable,
  }), [currentAge, retirementAge, projectedPortfolio, selfSSAtFRA, spouseSSAtFRA, taxTable]);

  const totalLifetimeHealthcare = healthcareCosts.reduce((s, h) => s + h.totalAnnual, 0);

  return (
    <Tabs defaultValue="rmd">
      {/* Nine tools, and the question here is which analysis to run — so all
          nine stay visible rather than hiding behind a horizontal swipe.

          Three columns at every phone width: the longest label wraps to two
          lines on a narrow screen rather than forcing two columns, which
          would make the list five rows tall and push the answer off screen.
          w-full because the list is w-fit by default, which would size the
          grid to its content instead of the screen. */}
      <TabsList className="mb-4 grid h-auto w-full auto-rows-fr grid-cols-3 gap-1 sm:flex sm:flex-wrap">
        <TabsTrigger value="rmd" className="min-h-9 px-2 text-center text-xs leading-tight whitespace-normal">RMDs</TabsTrigger>
        <TabsTrigger value="tax" className="min-h-9 px-2 text-center text-xs leading-tight whitespace-normal">Tax</TabsTrigger>
        <TabsTrigger value="roth" className="min-h-9 px-2 text-center text-xs leading-tight whitespace-normal">Roth</TabsTrigger>
        <TabsTrigger value="ss" className="min-h-9 px-2 text-center text-xs leading-tight whitespace-normal">SS Break-Even</TabsTrigger>
        <TabsTrigger value="catchup" className="min-h-9 px-2 text-center text-xs leading-tight whitespace-normal">Catch-Up</TabsTrigger>
        <TabsTrigger value="income" className="min-h-9 px-2 text-center text-xs leading-tight whitespace-normal">Income</TabsTrigger>
        <TabsTrigger value="fees" className="min-h-9 px-2 text-center text-xs leading-tight whitespace-normal">Fees</TabsTrigger>
        <TabsTrigger value="sequence" className="min-h-9 px-2 text-center text-xs leading-tight whitespace-normal">Sequence</TabsTrigger>
        <TabsTrigger value="healthcare" className="min-h-9 px-2 text-center text-xs leading-tight whitespace-normal">Healthcare</TabsTrigger>
      </TabsList>

      {/* 1. RMD Projections */}
      <TabsContent value="rmd">
        <Card>
          <CardHeader>
            <CardTitle>Required Minimum Distributions (RMDs)</CardTitle>
            <p className="text-sm text-muted-foreground">
              Starting at age 73, the IRS requires you to withdraw a minimum amount from tax-deferred accounts each year.
              These withdrawals are taxed as ordinary income.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="rounded-lg border p-3 text-center">
                <p className="text-xs text-muted-foreground">Projected Tax-Deferred at {RMD_START_AGE}</p>
                <p className="font-mono font-bold text-lg">{formatCurrency(firstRmd?.beginningBalance ?? 0)}</p>
              </div>
              <div className="rounded-lg border p-3 text-center">
                <p className="text-xs text-muted-foreground">First RMD (Age {RMD_START_AGE})</p>
                <p className="font-mono font-bold text-lg text-red-500">{formatCurrency(firstRmd?.rmdAmount ?? 0)}</p>
              </div>
              <div className="rounded-lg border p-3 text-center">
                <p className="text-xs text-muted-foreground">Tax on First RMD</p>
                <p className="font-mono font-bold text-lg">{formatCurrency(firstRmd?.taxEstimate ?? 0)}</p>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Tip: Roth conversions before age 73 can reduce your future RMDs and lifetime tax burden. See the Roth Conversion tab.
            </p>
            <div className="h-[200px] sm:h-[250px] -ml-2">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={rmds.filter((r) => r.rmdAmount > 0).slice(0, 22)}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" strokeOpacity={0.5} vertical={false} />
                  <XAxis dataKey="age" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tickFormatter={(v) => formatCompactCurrency(v)} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} width={60} />
                  <Tooltip formatter={(v) => formatCurrency(Number(v))} labelFormatter={(a) => `Age ${a}`} contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", fontSize: "13px" }} />
                  <Bar dataKey="rmdAmount" name="RMD" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </TabsContent>

      {/* 2. Tax Projections */}
      <TabsContent value="tax">
        <Card>
          <CardHeader>
            <CardTitle>Retirement Income Tax Projections</CardTitle>
            <p className="text-sm text-muted-foreground">
              Estimated federal tax based on your withdrawal sources, Social Security taxation (up to 85% is taxable for higher earners), and the {taxTable.taxYear} MFJ brackets.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            {(() => {
              const ssAnnual = (selfSSAtFRA + spouseSSAtFRA) * 12;
              const portfolioWithdrawal = projectedPortfolio * 0.04;
              const totalIncome = portfolioWithdrawal + ssAnnual * 0.85;
              const tax = estimateTaxMFJ(totalIncome, taxTable);
              const marginal = getMarginalRate(totalIncome, taxTable);
              const effective = totalIncome > 0 ? tax / totalIncome : 0;
              return (
                <div className="grid gap-4 sm:grid-cols-4">
                  <div className="rounded-lg border p-3 text-center">
                    <p className="text-xs text-muted-foreground">Projected Taxable Income</p>
                    <p className="font-mono font-bold">{formatCurrency(totalIncome)}</p>
                    <p className="text-[10px] text-muted-foreground">(4% withdrawal + 85% of SS)</p>
                  </div>
                  <div className="rounded-lg border p-3 text-center">
                    <p className="text-xs text-muted-foreground">Estimated Federal Tax</p>
                    <p className="font-mono font-bold text-red-500">{formatCurrency(tax)}</p>
                  </div>
                  <div className="rounded-lg border p-3 text-center">
                    <p className="text-xs text-muted-foreground">Effective Tax Rate</p>
                    <p className="font-mono font-bold">{(effective * 100).toFixed(1)}%</p>
                  </div>
                  <div className="rounded-lg border p-3 text-center">
                    <p className="text-xs text-muted-foreground">Marginal Bracket</p>
                    <p className="font-mono font-bold">{(marginal * 100).toFixed(0)}%</p>
                  </div>
                </div>
              );
            })()}
            <p className="text-xs text-muted-foreground">
              Tip: If your marginal rate in retirement will be higher than your current rate, prioritize Roth contributions now. If lower, traditional/tax-deferred is more efficient.
            </p>
          </CardContent>
        </Card>
      </TabsContent>

      {/* 3. Roth Conversion Ladder */}
      <TabsContent value="roth">
        <Card>
          <CardHeader>
            <CardTitle>Roth Conversion Ladder</CardTitle>
            <p className="text-sm text-muted-foreground">
              Convert traditional 401(k)/IRA to Roth between retirement and age 73 to reduce future RMDs and lifetime taxes.
              The strategy: fill up lower tax brackets each year with conversions.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            {rothLadder.length > 0 ? (
              <>
                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="rounded-lg border p-3 text-center">
                    <p className="text-xs text-muted-foreground">Total Converted</p>
                    <p className="font-mono font-bold text-lg">{formatCurrency(rothLadder[rothLadder.length - 1]?.cumulativeConverted || 0)}</p>
                  </div>
                  <div className="rounded-lg border p-3 text-center">
                    <p className="text-xs text-muted-foreground">Total Tax on Conversions</p>
                    <p className="font-mono font-bold text-lg text-red-500">{formatCurrency(rothLadder.reduce((s, r) => s + r.taxOnConversion, 0))}</p>
                  </div>
                  <div className="rounded-lg border p-3 text-center">
                    <p className="text-xs text-muted-foreground">Remaining Traditional at 73</p>
                    <p className="font-mono font-bold text-lg">{formatCurrency(rothLadder[rothLadder.length - 1]?.remainingTraditional || 0)}</p>
                  </div>
                </div>
                <div className="rounded-lg border overflow-x-auto max-h-[300px] overflow-y-auto">
                  <Table>
                    <TableHeader className="sticky top-0 bg-card">
                      <TableRow>
                        <TableHead>Age</TableHead>
                        <TableHead className="text-right">Convert</TableHead>
                        <TableHead className="text-right">Tax</TableHead>
                        <TableHead className="text-right">Rate</TableHead>
                        <TableHead className="text-right">Cumulative</TableHead>
                        <TableHead className="text-right">Traditional Left</TableHead>
                        <TableHead className="text-right">Roth Balance</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rothLadder.map((r) => (
                        <TableRow key={r.age}>
                          <TableCell className="font-medium">{r.age}</TableCell>
                          <TableCell className="text-right font-mono text-sm text-green-500">{formatCurrency(r.optimalConversionAmount)}</TableCell>
                          <TableCell className="text-right font-mono text-sm text-red-500">{formatCurrency(r.taxOnConversion)}</TableCell>
                          <TableCell className="text-right font-mono text-sm">{(r.marginalRateOnConversion * 100).toFixed(0)}%</TableCell>
                          <TableCell className="text-right font-mono text-sm">{formatCurrency(r.cumulativeConverted)}</TableCell>
                          <TableCell className="text-right font-mono text-sm">{formatCurrency(r.remainingTraditional)}</TableCell>
                          <TableCell className="text-right font-mono text-sm">{formatCurrency(r.rothBalance)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                <p className="text-xs text-muted-foreground">
                  Strategy: Convert enough each year to fill the 22% bracket without jumping to 24%. Converted money grows tax-free in Roth forever. Reduces RMDs after 73.
                </p>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">No conversion window available — you may already be past retirement age or at RMD age.</p>
            )}
          </CardContent>
        </Card>
      </TabsContent>

      {/* 4. SS Break-Even */}
      <TabsContent value="ss">
        <Card>
          <CardHeader>
            <CardTitle>Social Security Break-Even Analysis</CardTitle>
            <p className="text-sm text-muted-foreground">
              At what age does delaying Social Security &quot;break even&quot; vs claiming at 62?
              Claiming early means smaller checks but more of them. Delaying means bigger checks but you wait.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            {selfSSAtFRA > 0 && (
              <div>
                <h4 className="text-sm font-semibold mb-2">Your Social Security</h4>
                <div className="rounded-lg border overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Claim Age</TableHead>
                        <TableHead className="text-right">Monthly</TableHead>
                        <TableHead className="text-right">Annual</TableHead>
                        <TableHead className="text-right">Cumulative at 80</TableHead>
                        <TableHead className="text-right">Cumulative at 85</TableHead>
                        <TableHead>Break-Even vs 62</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {selfSSBreakEven.map((r) => (
                        <TableRow key={r.claimingAge} className={r.claimingAge === selfFRA ? "bg-primary/5" : ""}>
                          <TableCell className="font-medium">
                            {r.claimingAge} {r.claimingAge === selfFRA && <Badge variant="secondary" className="text-[10px] ml-1">FRA</Badge>}
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm">{formatCurrency(r.monthlyBenefit)}</TableCell>
                          <TableCell className="text-right font-mono text-sm">{formatCurrency(r.annualBenefit)}</TableCell>
                          <TableCell className="text-right font-mono text-sm">{formatCurrency(r.cumulativeByAge[80] || 0)}</TableCell>
                          <TableCell className="text-right font-mono text-sm">{formatCurrency(r.cumulativeByAge[85] || 0)}</TableCell>
                          <TableCell>
                            {r.breakEvenVs62 ? (
                              <span className="text-sm">Age {r.breakEvenVs62}</span>
                            ) : (
                              <span className="text-xs text-muted-foreground">baseline</span>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  Tip: If you expect to live past the break-even age, delaying is usually better. Claiming at 70 gives you 77% more per month than 62.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </TabsContent>

      {/* 5. Catch-Up Contributions */}
      <TabsContent value="catchup">
        <Card>
          <CardHeader>
            <CardTitle>Catch-Up Contribution Impact</CardTitle>
            <p className="text-sm text-muted-foreground">
              At age 50 you get extra contribution limits. Ages 60-63 get an enhanced catch-up. Here&apos;s the impact of maxing these out.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-lg border p-3 text-center">
                <p className="text-xs text-muted-foreground">Total Extra from Catch-Ups (401k)</p>
                <p className="font-mono font-bold text-lg text-green-500">
                  {formatCurrency(catchUp401k[catchUp401k.length - 1]?.cumulativeExtra || 0)}
                </p>
                <p className="text-[10px] text-muted-foreground">contributions + compound growth by retirement</p>
              </div>
              <div className="rounded-lg border p-3 text-center">
                <p className="text-xs text-muted-foreground">Ages 60-63 Enhanced Catch-Up</p>
                <p className="font-mono font-bold text-lg">{formatCurrency(11250)}/yr extra</p>
                <p className="text-[10px] text-muted-foreground">New SECURE 2.0 provision (vs $7,500 for ages 50-59)</p>
              </div>
            </div>
            <div className="h-[200px] sm:h-[250px] -ml-2">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={catchUp401k.filter((c) => c.catchUpAmount > 0)}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" strokeOpacity={0.5} vertical={false} />
                  <XAxis dataKey="age" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tickFormatter={(v) => formatCompactCurrency(v)} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} width={60} />
                  <Tooltip formatter={(v) => formatCurrency(Number(v))} labelFormatter={(a) => `Age ${a}`} contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", fontSize: "13px" }} />
                  <Bar dataKey="catchUpAmount" name="Catch-Up" fill="#22c55e" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </TabsContent>

      {/* 6. Income Replacement Ratio */}
      <TabsContent value="income">
        <Card>
          <CardHeader>
            <CardTitle>Income Replacement Ratio</CardTitle>
            <p className="text-sm text-muted-foreground">
              What percentage of your pre-retirement income will your retirement income replace? Financial planners target 70-80%.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="rounded-lg border p-3 text-center">
                <p className="text-xs text-muted-foreground">Current Household Income</p>
                <p className="font-mono font-bold text-lg">{formatCurrency(incomeReplacement.preTaxHouseholdIncome)}</p>
              </div>
              <div className="rounded-lg border p-3 text-center">
                <p className="text-xs text-muted-foreground">Projected Retirement Income</p>
                <p className="font-mono font-bold text-lg">{formatCurrency(incomeReplacement.projectedRetirementIncome)}</p>
              </div>
              <div className={cn("rounded-lg border p-3 text-center", incomeReplacement.replacementRatio >= 80 ? "border-green-500/50 bg-green-500/5" : incomeReplacement.replacementRatio >= 70 ? "border-yellow-500/50 bg-yellow-500/5" : "border-red-500/50 bg-red-500/5")}>
                <p className="text-xs text-muted-foreground">Replacement Ratio</p>
                <p className={cn("font-mono font-bold text-2xl", incomeReplacement.replacementRatio >= 80 ? "text-green-500" : incomeReplacement.replacementRatio >= 70 ? "text-yellow-500" : "text-red-500")}>
                  {incomeReplacement.replacementRatio}%
                </p>
                <p className="text-[10px] text-muted-foreground">Target: 80%</p>
              </div>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-xs font-medium mb-2">Income Sources Breakdown</p>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">Portfolio (4% rule)</span><span className="font-mono">{formatCurrency(incomeReplacement.sources.portfolioWithdrawal)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Your Social Security</span><span className="font-mono">{formatCurrency(incomeReplacement.sources.selfSS)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Spouse Social Security</span><span className="font-mono">{formatCurrency(incomeReplacement.sources.spouseSS)}</span></div>
              </div>
            </div>
            {incomeReplacement.gap > 0 && (
              <p className="text-xs text-red-500">
                Gap: {formatCurrency(incomeReplacement.gap)}/yr below the 80% target. Consider increasing savings or delaying retirement.
              </p>
            )}
          </CardContent>
        </Card>
      </TabsContent>

      {/* 7. Fee Impact */}
      <TabsContent value="fees">
        <Card>
          <CardHeader>
            <CardTitle>Fee Impact Analysis</CardTitle>
            <p className="text-sm text-muted-foreground">
              How much are fund expense ratios costing you? Even small differences compound dramatically over decades.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="rounded-lg border p-3 text-center">
                <p className="text-xs text-muted-foreground">Weighted Expense Ratio</p>
                <p className="font-mono font-bold text-lg">{feeImpact.weightedExpenseRatio}%</p>
              </div>
              <div className="rounded-lg border p-3 text-center">
                <p className="text-xs text-muted-foreground">Annual Fees</p>
                <p className="font-mono font-bold text-lg text-red-500">{formatCurrency(feeImpact.totalAnnualFees)}/yr</p>
              </div>
              <div className="rounded-lg border p-3 text-center">
                <p className="text-xs text-muted-foreground">30-Year Fee Drag</p>
                <p className="font-mono font-bold text-lg text-red-500">{formatCurrency(feeImpact.thirtyYearCumulativeDrag)}</p>
                <p className="text-[10px] text-muted-foreground">lost to fees vs 0% cost</p>
              </div>
            </div>
            <div className="rounded-lg border overflow-x-auto max-h-[300px] overflow-y-auto">
              <Table>
                <TableHeader className="sticky top-0 bg-card">
                  <TableRow>
                    <TableHead>Ticker</TableHead>
                    <TableHead className="text-right">Value</TableHead>
                    <TableHead className="text-right">Expense Ratio</TableHead>
                    <TableHead className="text-right">Annual Fee</TableHead>
                    <TableHead className="text-right">30yr Drag</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {feeImpact.holdings.map((h) => (
                    <TableRow key={h.ticker}>
                      <TableCell className="font-mono font-medium">{h.ticker}</TableCell>
                      <TableCell className="text-right font-mono text-sm">{formatCurrency(h.value)}</TableCell>
                      <TableCell className="text-right font-mono text-sm">{h.expenseRatio}%</TableCell>
                      <TableCell className="text-right font-mono text-sm text-red-500">{formatCurrency(h.annualFee)}</TableCell>
                      <TableCell className="text-right font-mono text-sm text-red-500">{formatCurrency(h.thirtyYearDrag)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <p className="text-xs text-muted-foreground">
              Tip: Look for index fund alternatives with lower expense ratios. Moving from 0.5% to 0.03% on a large position saves thousands over time.
            </p>
          </CardContent>
        </Card>
      </TabsContent>

      {/* 8. Sequence of Returns Risk */}
      <TabsContent value="sequence">
        <Card>
          <CardHeader>
            <CardTitle>Sequence of Returns Risk</CardTitle>
            <p className="text-sm text-muted-foreground">
              The order of returns matters as much as the average. A bear market in your first few years of retirement is far more dangerous than one 15 years in — even with the same average return.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="h-[280px] -ml-2">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" strokeOpacity={0.5} vertical={false} />
                  <XAxis dataKey="year" type="number" domain={[1, 30]} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} label={{ value: "Year of Retirement", position: "bottom", fontSize: 11 }} />
                  <YAxis tickFormatter={(v) => formatCompactCurrency(v)} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} width={60} />
                  <Tooltip formatter={(v) => formatCurrency(Number(v))} contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", fontSize: "13px" }} />
                  <Legend />
                  {sequenceRisk.map((s, i) => (
                    <Line
                      key={s.scenario}
                      data={s.yearByYear}
                      dataKey="balance"
                      name={s.scenario}
                      stroke={["#ef4444", "#22c55e", "#6366f1", "#f59e0b"][i]}
                      strokeWidth={2}
                      dot={false}
                      type="monotone"
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {sequenceRisk.map((s) => (
                <div key={s.scenario} className={cn("rounded-lg border p-3", s.survived ? "" : "border-red-500/50 bg-red-500/5")}>
                  <p className="font-medium text-sm">{s.scenario}</p>
                  <p className="text-xs text-muted-foreground">{s.description}</p>
                  <p className={cn("font-mono text-sm mt-1", s.survived ? "text-green-500" : "text-red-500")}>
                    {s.survived ? `${formatCurrency(s.endBalance)} remaining` : "Portfolio depleted"}
                  </p>
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Tip: Having 2-3 years of expenses in cash/bonds protects against sequence risk. You won&apos;t need to sell stocks in a downturn.
            </p>
          </CardContent>
        </Card>
      </TabsContent>

      {/* 9. Healthcare Costs */}
      <TabsContent value="healthcare">
        <Card>
          <CardHeader>
            <CardTitle>Healthcare Cost Projections</CardTitle>
            <p className="text-sm text-muted-foreground">
              Healthcare is often the largest expense in retirement. This models Medicare premiums, supplemental insurance, and out-of-pocket costs with healthcare-specific inflation (~5%/yr).
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="rounded-lg border p-3 text-center">
                <p className="text-xs text-muted-foreground">Year 1 Healthcare Cost</p>
                <p className="font-mono font-bold text-lg">{formatCurrency(healthcareCosts[0]?.totalAnnual || 0)}</p>
              </div>
              <div className="rounded-lg border p-3 text-center">
                <p className="text-xs text-muted-foreground">Year 10 (with inflation)</p>
                <p className="font-mono font-bold text-lg">{formatCurrency(healthcareCosts[9]?.totalAnnual || 0)}</p>
              </div>
              <div className="rounded-lg border p-3 text-center">
                <p className="text-xs text-muted-foreground">30-Year Total</p>
                <p className="font-mono font-bold text-lg text-red-500">{formatCurrency(totalLifetimeHealthcare)}</p>
              </div>
            </div>
            <div className="h-[200px] sm:h-[250px] -ml-2">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={healthcareCosts}>
                  <defs>
                    <linearGradient id="healthGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#ef4444" stopOpacity={0.3} />
                      <stop offset="100%" stopColor="#ef4444" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" strokeOpacity={0.5} vertical={false} />
                  <XAxis dataKey="age" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tickFormatter={(v) => formatCompactCurrency(v)} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} width={60} />
                  <Tooltip formatter={(v) => formatCurrency(Number(v))} labelFormatter={(a) => `Age ${a}`} contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", fontSize: "13px" }} />
                  <Area type="monotone" dataKey="totalAnnual" stroke="#ef4444" fill="url(#healthGrad)" strokeWidth={2} dot={false} name="Annual Cost" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <p className="text-xs text-muted-foreground">
              Note: Pre-Medicare (before 65) healthcare is significantly more expensive if you retire early. Budget $1,000-1,500/mo per person on the ACA marketplace. IRMAA surcharges apply if your income exceeds $206k.
            </p>
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  );
}
