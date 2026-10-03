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
import { runDetailedProjection, adjustSSBenefit } from "../src/lib/utils/projection-scenarios";
import { calculateSSBreakEven, calculateRMD, estimateTaxMFJ } from "../src/lib/utils/financial-analytics";
import { runProjectionMonteCarlo, seededRandom } from "../src/lib/projections/monte-carlo";
import { controlsFromSaved, projectionInputs, type ProjectionHousehold } from "../src/lib/projections/settings";
import { calculateWithdrawalStrategies } from "../src/lib/utils/withdrawal-strategies";

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

  console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILED`);
  return failures;
}

process.exit(main() === 0 ? 0 : 1);
