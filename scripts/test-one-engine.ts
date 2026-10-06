/**
 * One tested engine answers "will the money last?" everywhere.
 *
 * Until October 2026 four calculations answered it: the tested engine, a
 * Monte Carlo inside the Projections page, another inside its scenarios, and
 * an older engine behind the AI assistant. They disagreed on when Social
 * Security starts, how spending inflates, what catch-up contributions add and
 * which tax year applies. On a sample household the page showed a 94% chance
 * where the tested rules gave about 80%. Now the odds are the engine itself
 * run against simulated markets, and the page and the assistant build their
 * inputs with the same functions.
 */
import { runDetailedProjection, adjustSSBenefit, type DetailedProjectionParams } from "../src/lib/utils/projection-scenarios";
import { calculateSSBreakEven, calculateRMD, estimateTaxMFJ } from "../src/lib/utils/financial-analytics";
import { runProjectionMonteCarlo, seededRandom } from "../src/lib/projections/monte-carlo";
import { controlsFromSaved, projectionInputs, type ProjectionHousehold } from "../src/lib/projections/settings";
import { calculateWithdrawalStrategies } from "../src/lib/utils/withdrawal-strategies";
import { balancesAtRetirement } from "../src/lib/projections/at-retirement";
import { buildProjectionAccounts } from "../src/lib/projections/build-accounts";
import { whatIfParams } from "../src/lib/projections/what-if";
import { getDefaultGlidePathConfig } from "../src/lib/utils/glide-path";

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${ok || !detail ? "" : ` — ${detail}`}`);
  if (!ok) failures++;
}
const near = (a: number, b: number, tol = 1) => Math.abs(a - b) <= tol;

const account = (name: string, type: string, taxTreatment: string, value: number, contrib = 0) => ({
  name, owner: "self", type, taxTreatment, value,
  isActivelyContributing: contrib > 0, annualContribution: contrib, annualEscalation: 0,
  maxAnnualContribution: 0, contributionMethod: "fixed_amount", contributionPct: 0,
  employerMatchRate: 0, employerMatchMaxPct: 0, salary: 0, salaryGrowth: null, ownerCurrentAge: 55,
});

// The Q9 comparison household.
const household: ProjectionHousehold = {
  accounts: [
    account("401k", "401k", "tax_deferred", 700_000, 30_000),
    account("Roth IRA", "ira_roth", "tax_free", 200_000),
    account("Brokerage", "brokerage", "taxable", 300_000),
  ],
  currentAge: 55,
  retirementAge: 65,
  spouseAge: null,
  selfSSAtFRA: 3_000,
  spouseSSAtFRA: 0,
  selfFRA: 67,
  spouseFRA: 67,
  monthlyExpenses: 7_000,
  annualContributions: 30_000,
};

function main() {
  // ---- the input builder ---------------------------------------------------
  const defaults = controlsFromSaved(household, null);
  check(
    "with nothing saved: claim at full retirement age, 35 years, moderate market, spend what Settings says",
    defaults.selfSSAge === 67 && defaults.retirementYears === 35 && defaults.scenarioId === "moderate" &&
      defaults.monthlySpending === 7_000 && defaults.withdrawalMethod === "expense",
    JSON.stringify(defaults)
  );
  const saved = controlsFromSaved(household, { ssClaimAgeSelf: 62, retirementYears: 25, monthlySpending: 8_000, marketScenario: "conservative" });
  check(
    "saved controls are used as saved",
    saved.selfSSAge === 62 && saved.retirementYears === 25 && saved.monthlySpending === 8_000 && saved.scenarioId === "conservative"
  );
  const early = projectionInputs(household, saved);
  check("claiming at 62 pays 70% of the full benefit, by the SSA's tiered rule", near(early.selfSSMonthly, 2_100, 0.01), String(early.selfSSMonthly));
  check("and Social Security starts at 62, seven years from now", early.ssStartYear === 7, String(early.ssStartYear));

  // ---- a couple who claim at different ages (#65) -------------------------
  // One combined benefit, started at the first claim, paid the partner's
  // larger age-70 benefit eight years before it was claimed.
  const couple: ProjectionHousehold = { ...household, spouseAge: 55, spouseSSAtFRA: 2_000 };
  const staggered = projectionInputs(couple, controlsFromSaved(couple, { ssClaimAgeSelf: 62, ssClaimAgeSpouse: 70 }));
  const ss = runDetailedProjection(staggered.params).ssIncome;
  const firstOnly = 12 * adjustSSBenefit(3_000, 67, 62);
  const bothClaimed = firstOnly + 12 * adjustSSBenefit(2_000, 67, 70);
  check("a couple's Social Security: nothing before the first claim", ss[6] === 0, String(ss[6]));
  check(
    "from 62 only the partner who claimed at 62 is paid",
    near(ss[7], firstOnly) && near(ss[14], firstOnly),
    `${Math.round(ss[7])} and ${Math.round(ss[14])}, expected ${Math.round(firstOnly)}`
  );
  check(
    "and the other partner's delayed benefit starts when they claim at 70, not before",
    near(ss[15], bothClaimed),
    `${Math.round(ss[15])}, expected ${Math.round(bothClaimed)}`
  );
  // ---- every money column in the year's own dollars (#66) -----------------
  // Social Security was recorded only in today's dollars, and the Projections
  // page printed it beside withdrawals and balances in future dollars.
  const couplesYears = runDetailedProjection(staggered.params);
  const level = couplesYears.priceLevel;
  check(
    "the price level is today's prices grown by inflation, one year per row",
    near(level[0], 1 + staggered.params.inflationPct / 100, 1e-9) &&
      near(level[9], Math.pow(1 + staggered.params.inflationPct / 100, 10), 1e-9)
  );
  check(
    "Social Security in the year's own dollars is today's figure times that year's price level",
    couplesYears.ssIncome.every((v, y) => near(couplesYears.ssIncomeNominal[y], v * level[y], 1)),
    `${couplesYears.ssIncomeNominal[15]} vs ${Math.round(couplesYears.ssIncome[15] * level[15])}`
  );
  const firstRetired = staggered.yearsToRetirement;
  check(
    "spending is recorded in retirement only, inflated from today",
    couplesYears.spendingNominal[firstRetired - 1] === 0 &&
      near(couplesYears.spendingNominal[firstRetired], staggered.params.annualExpenses * level[firstRetired], 1)
  );
  const spendable = (y: number) =>
    (couplesYears.withdrawals[y] - couplesYears.taxes[y] - couplesYears.reinvested[y] + couplesYears.ssIncomeNominal[y]) / level[y];
  check(
    "what pays for the first retirement year, after tax and in today's dollars, is the spending entered",
    near(spendable(firstRetired), staggered.params.annualExpenses, 2),
    `${Math.round(spendable(firstRetired))} vs ${staggered.params.annualExpenses}`
  );

  check(
    "each partner's claim is reported with its own start",
    staggered.selfSSStartYear === 7 && staggered.spouseSSStartYear === 15 && staggered.ssStartYear === 7,
    JSON.stringify({ self: staggered.selfSSStartYear, spouse: staggered.spouseSSStartYear })
  );
  check(
    "the engine gets the saved horizon, spending and market",
    early.params.yearsInRetirement === 25 && early.params.annualExpenses === 96_000 && early.params.returnPct === early.scenario.returnPct,
    JSON.stringify({ y: early.params.yearsInRetirement, e: early.params.annualExpenses })
  );

  // ---- one Social Security rule ---------------------------------------------
  const table = calculateSSBreakEven(3_000, 67);
  check(
    "Projections and Analytics give the same benefit at every claiming age",
    table.every((r) => near(adjustSSBenefit(3_000, 67, r.claimingAge), r.monthlyBenefit, 0.01)),
    table.map((r) => `${r.claimingAge}:${r.monthlyBenefit}/${adjustSSBenefit(3_000, 67, r.claimingAge)}`).join(" ")
  );

  // ---- the odds are the engine ---------------------------------------------
  const base = projectionInputs(household, defaults);
  const engine = runDetailedProjection(base.params);
  const calm = runProjectionMonteCarlo(base.params, { volatilityPct: 0, simulations: 20 });
  check(
    "with no volatility every simulated year is the engine's own year",
    calm.chartData.every((row, y) => row.p10 === engine.totalValues[y] && row.p90 === engine.totalValues[y]),
    `year 0: ${calm.chartData[0].p50} vs ${engine.totalValues[0]}`
  );
  check(
    "so its odds are all or nothing, as the engine's last year says",
    calm.successRate === (engine.totalValues[engine.totalValues.length - 1] > 0 ? 100 : 0),
    String(calm.successRate)
  );

  const once = runProjectionMonteCarlo(base.params, { volatilityPct: base.volatilityPct, simulations: 200 });
  const again = runProjectionMonteCarlo(base.params, { volatilityPct: base.volatilityPct, simulations: 200 });
  check(
    "the same inputs give the same odds every time, so the server and the browser agree",
    once.successRate === again.successRate && JSON.stringify(once.chartData) === JSON.stringify(again.chartData)
  );
  check(
    "and the markets vary, so the odds are not trivially all or nothing",
    once.chartData[base.yearsToRetirement - 1].p10 < once.chartData[base.yearsToRetirement - 1].p90
  );
  const r = seededRandom(1);
  const draws = Array.from({ length: 10_000 }, r);
  const mean = draws.reduce((s, x) => s + x, 0) / draws.length;
  check("the generator is uniform on [0, 1)", draws.every((x) => x >= 0 && x < 1) && near(mean, 0.5, 0.01), String(mean));

  // A later claiming age must lower the odds' path before 67: the old page
  // simulation paid Social Security from the first day of retirement.
  const late = projectionInputs(household, { ...defaults, selfSSAge: 70 });
  const lateCalm = runProjectionMonteCarlo(late.params, { volatilityPct: 0, simulations: 5 });
  const lateEngine = runDetailedProjection(late.params);
  check(
    "a later claiming age reaches the simulation through the engine",
    lateCalm.chartData.every((row, y) => row.p50 === lateEngine.totalValues[y]) &&
      lateEngine.totalValues[13] < engine.totalValues[13],
    `${lateEngine.totalValues[13]} vs ${engine.totalValues[13]}`
  );

  // ---- the withdrawal-order comparison uses today's rules -------------------
  const [conventional, , rothFirst] = calculateWithdrawalStrategies({
    taxDeferredBalance: 1_000_000, taxFreeBalance: 500_000, taxableBalance: 0,
    annualExpenses: 60_000, annualSSIncome: 0, yearsInRetirement: 1, realReturnRate: 0, startAge: 75,
  });
  const rmd = calculateRMD(1_000_000, 75);
  const y0 = conventional.yearByYear[0];
  check("the RMD comes from the IRS table", y0.taxDeferred >= Math.round(rmd), `${y0.taxDeferred} vs ${Math.round(rmd)}`);
  check(
    "and is taxed with today's table",
    near(y0.taxEstimate, estimateTaxMFJ(y0.taxDeferred), 1),
    `${y0.taxEstimate} vs ${Math.round(estimateTaxMFJ(y0.taxDeferred))}`
  );
  check(
    "drawing Roth first still takes the RMD, and taxes only that",
    near(rothFirst.yearByYear[0].taxDeferred, rmd, 1) && near(rothFirst.yearByYear[0].taxEstimate, estimateTaxMFJ(rmd), 1),
    JSON.stringify(rothFirst.yearByYear[0])
  );
  check(
    "each strategy funds the spending after its tax",
    [conventional, rothFirst].every((s) => s.yearByYear[0].totalWithdrawal - s.yearByYear[0].taxEstimate >= 60_000 - 1)
  );

  // ---- the assistant's analytics read the Analytics page's balances ----------
  // The analytics tool used a flat annuity: no IRS cap, no employer money.
  const acctRow = {
    id: "a1", clerkId: "u", name: "401k", owner: "self", accountType: "401k", taxTreatment: "tax_deferred",
    institution: "Test", isActive: true, isActivelyContributing: true, plaidItemId: null, plaidAccountId: null,
    dataSource: "manual", createdAt: new Date(), updatedAt: new Date(),
  };
  const contribRow = {
    id: "c1", clerkId: "u", owner: "self", accountId: "a1", label: "401k", accountType: "401k",
    contributionMethod: "percent_of_salary", contributionPercent: "20", contributionAmount: null,
    frequency: "monthly", isActive: true, hasEmployerMatch: true, employerMatchRate: "1", employerMatchMaxPercent: "5",
    hasEmployerNonElective: false, employerNonElectivePercent: null, employerNonElectiveAmount: null,
    hasAnnualEscalation: false, annualEscalationAmount: null, maxAnnualContribution: null,
    vestingSchedule: "immediate", vestingYears: null, serviceStartDate: null, endedOn: null,
    pausedFrom: null, resumesOn: null, notes: null, createdAt: new Date(), updatedAt: new Date(),
  };
  const pref = {
    currentAge: 45, retirementAge: 65, annualSalary: "250000", spouseAnnualSalary: null,
    salaryGrowth: null, spouseSalaryGrowth: null, spouseCurrentAge: null, spouseRetirementAge: null,
    riskTolerance: "moderate",
  };
  const rowsIn = {
    accounts: [acctRow as never],
    holdings: [{ accountId: "a1", currentValue: "400000", accountType: "401k" }],
    contribs: [contribRow as never],
  };
  const shared = balancesAtRetirement({ pref: pref as never, ...rowsIn });
  const direct = runDetailedProjection({
    accounts: buildProjectionAccounts({
      ...rowsIn, selfSalary: 250_000, spouseSalary: 0, selfSalaryGrowth: null, spouseSalaryGrowth: null,
      selfCurrentAge: 45, spouseCurrentAge: null, selfYearsToRetirement: 20, spouseYearsToRetirement: 20,
    }),
    totalAnnualContributions: shared.totalAnnualContributions, yearsToRetirement: 20, yearsInRetirement: 1,
    startAge: 45, returnPct: shared.returnPct, inflationPct: 3, annualExpenses: 0, socialSecurity: [],
  });
  check(
    "the analytics balances at retirement are the engine's",
    near(shared.atRetirement.total, direct.totalValues[19], 0),
    `${shared.atRetirement.total} vs ${direct.totalValues[19]}`
  );
  const rate = shared.returnPct / 100;
  const growth = Math.pow(1 + rate, 20);
  const annuity = 400_000 * growth + shared.totalAnnualContributions * ((growth - 1) / rate);
  check(
    "not the flat annuity the assistant used, which ignored the IRS cap on a 20% deferral",
    shared.atRetirement.total < annuity * 0.97,
    `${Math.round(shared.atRetirement.total)} vs annuity ${Math.round(annuity)}`
  );

  // ---- the what-if scenarios (#69) ---------------------------------------
  // Each changes one thing in the engine's inputs. Three missed what they
  // changed while they lived inside the page.
  const pct = {
    ...account("401k", "401k", "tax_deferred", 100_000), isActivelyContributing: true,
    contributionMethod: "percent_of_salary", contributionPct: 10, salary: 100_000,
    employerMatchRate: 0.5, employerMatchMaxPct: 6, ownerCurrentAge: 40,
  };
  const fixedAmount = { ...account("Roth 401k", "401k", "tax_free", 50_000, 10_000), ownerCurrentAge: 40 };
  const partners = { ...account("Partner 401k", "401k", "tax_deferred", 80_000, 8_000), owner: "spouse", ownerRetirementYear: 20, ownerCurrentAge: 40 };
  const household69: DetailedProjectionParams = {
    accounts: [pct, fixedAmount, partners, account("Brokerage", "brokerage", "taxable", 200_000)],
    totalAnnualContributions: 31_000, yearsToRetirement: 20, yearsInRetirement: 30, startAge: 40,
    returnPct: 7, inflationPct: 3, annualExpenses: 60_000, socialSecurity: [{ annual: 30_000, startYear: 27 }],
  };
  const run = (p: DetailedProjectionParams) => runDetailedProjection(p);
  const perAccount = (p: DetailedProjectionParams, name: string, y: number) =>
    run(p).accountProjections.find((a) => a.name === name)!.contributionPerYear[y];

  const boosted = whatIfParams(household69, "boost_savings", 50);
  check(
    "Boost Savings raises a deferral set as a share of pay, and the match on it: $13,000 becomes $18,000",
    perAccount(household69, "401k", 0) === 13_000 && perAccount(boosted, "401k", 0) === 18_000,
    `${perAccount(household69, "401k", 0)} → ${perAccount(boosted, "401k", 0)}`
  );
  check("and a deferral set as an amount: $10,000 becomes $15,000", perAccount(boosted, "Roth 401k", 0) === 15_000, String(perAccount(boosted, "Roth 401k", 0)));

  const sooner = whatIfParams(household69, "early_retire", 5);
  const soonerRun = run(sooner);
  check(
    "Retire Earlier starts withdrawals five years sooner and still ends at the same age",
    run(household69).withdrawals[15] === 0 && soonerRun.withdrawals[15] > 0 && soonerRun.ages.length === run(household69).ages.length
  );
  check(
    "and your contributions stop then, not at the old date",
    perAccount(sooner, "401k", 14) > 0 && perAccount(sooner, "401k", 15) === 0 && perAccount(sooner, "Roth 401k", 15) === 0
  );
  check("while a partner who keeps working keeps contributing", perAccount(sooner, "Partner 401k", 17) === 8_000, String(perAccount(sooner, "Partner 401k", 17)));

  const gliding = { ...household69, glidePath: { ...getDefaultGlidePathConfig(40, 60, "moderate"), enabled: true } };
  const lower = whatIfParams(gliding, "lower_returns", 4);
  const flat4 = run({ ...household69, returnPct: 4 });
  check(
    "Lower Returns applies with the glide path on: the same as markets returning 4% a year",
    run(lower).totalValues.at(-1) === flat4.totalValues.at(-1) && run(gliding).totalValues.at(-1) !== flat4.totalValues.at(-1),
    `${run(lower).totalValues.at(-1)} vs ${flat4.totalValues.at(-1)}`
  );

  const cut = run(whatIfParams(household69, "reduced_ss", 25));
  check("Reduced Social Security cuts every benefit from its start: $30,000 becomes $22,500", cut.ssIncome[27] === 22_500 && cut.ssIncome[26] === 0, String(cut.ssIncome[27]));
  const crash = whatIfParams(household69, "market_crash", 30);
  check("Market Crash takes the same share off every account today", crash.accounts.every((a, i) => near(a.value, household69.accounts[i].value * 0.7, 1e-6)));
  const hot = run(whatIfParams(household69, "high_inflation", 5));
  check("High Inflation raises spending at that rate", near(hot.spendingNominal[20], 60_000 * Math.pow(1.05, 21), 1), String(hot.spendingNominal[20]));

  console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILED`);
  return failures;
}

process.exit(main() === 0 ? 0 : 1);
