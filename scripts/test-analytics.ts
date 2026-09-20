/**
 * The retirement analytics, and the eleven ways they were wrong.
 *
 * Each assertion below names the behaviour that shipped, so a regression
 * reads as the old bug returning rather than as an opaque number changing.
 * All of these failed in the direction that made the plan look easier, which
 * is the direction nobody questions.
 */
import {
  RMD_START_AGE,
  TAX_YEAR,
  calculateCatchUpImpact,
  calculateRMD,
  calculateRothConversionLadder,
  calculateSSBreakEven,
  calculateSequenceRisk,
  estimateTaxMFJ,
  projectHealthcareCosts,
  projectRMDs,
} from "../src/lib/utils/financial-analytics";
import { runDetailedProjection } from "../src/lib/utils/projection-scenarios";

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${ok || !detail ? "" : ` — ${detail}`}`);
  if (!ok) failures++;
}
const near = (a: number, b: number, tol = 1) => Math.abs(a - b) <= tol;

function main() {
  // ---- 1. retirement spending inflates from today ------------------------
  const base = {
    accounts: [{
      name: "401k", owner: "self", type: "401k", taxTreatment: "tax_deferred",
      value: 1_000_000, isActivelyContributing: false, annualContribution: 0,
      annualEscalation: 0, maxAnnualContribution: 0, contributionMethod: "fixed_amount",
      contributionPct: 0, employerMatchRate: 0, employerMatchMaxPct: 0,
      salary: 0, salaryGrowth: null,
    }],
    totalAnnualContributions: 0,
    yearsInRetirement: 5,
    startAge: 44,
    returnPct: 0,          // isolate inflation from growth
    inflationPct: 3,
    annualExpenses: 100_000,
    annualSSIncome: 0,
    ssStartYear: 99,
    withdrawalMethod: "expense" as const,
  };
  const near0 = runDetailedProjection({ ...base, yearsToRetirement: 1 });
  const far = runDetailedProjection({ ...base, yearsToRetirement: 18 });

  const firstWithdrawalNear = near0.withdrawals[1];
  const firstWithdrawalFar = far.withdrawals[18];
  check(
    "retiring later means a larger first-year withdrawal, because spending inflated meanwhile",
    firstWithdrawalFar > firstWithdrawalNear * 1.4,
    `${Math.round(firstWithdrawalNear)} vs ${Math.round(firstWithdrawalFar)}`
  );
  check(
    "and it matches today's spending compounded to the retirement date",
    near(firstWithdrawalFar, 100_000 * Math.pow(1.03, 19), 2),
    `${Math.round(firstWithdrawalFar)} vs ${Math.round(100_000 * Math.pow(1.03, 19))}`
  );

  // ---- 4. Social Security reduction is tiered ----------------------------
  const ss = calculateSSBreakEven(3000, 67);
  const at = (age: number) => ss.find((r) => r.claimingAge === age)!.monthlyBenefit;
  check("claiming at 62 with FRA 67 is a 30% cut, not 33.35%", at(62) === 2100, String(at(62)));
  check("claiming at 65 is a 13.33% cut", at(65) === 2600, String(at(65)));
  check("claiming at 70 is a 24% credit", at(70) === 3720, String(at(70)));
  check(
    "the first three early years are steeper than the rest — the rule is two-tiered",
    at(67) - at(66) > at(63) - at(62),
    `${at(67) - at(66)} vs ${at(63) - at(62)}`
  );

  // ---- 5. healthcare inflates from today ---------------------------------
  const soon = projectHealthcareCosts({ currentAge: 61, retirementAge: 62, yearsToProject: 2, annualRetirementIncome: 100_000, inflationPct: 3 });
  const later = projectHealthcareCosts({ currentAge: 44, retirementAge: 62, yearsToProject: 2, annualRetirementIncome: 100_000, inflationPct: 3 });
  check(
    "a retirement eighteen years out costs more in its first year than one next year",
    later[0].totalAnnual > soon[0].totalAnnual * 2,
    `${later[0].totalAnnual} vs ${soon[0].totalAnnual}`
  );

  // ---- 6. IRMAA is tiered, not flat at the top ---------------------------
  const justOver = projectHealthcareCosts({ currentAge: 64, retirementAge: 65, yearsToProject: 1, annualRetirementIncome: 215_000, inflationPct: 3 })[0];
  const wayOver = projectHealthcareCosts({ currentAge: 64, retirementAge: 65, yearsToProject: 1, annualRetirementIncome: 900_000, inflationPct: 3 })[0];
  const under = projectHealthcareCosts({ currentAge: 64, retirementAge: 65, yearsToProject: 1, annualRetirementIncome: 150_000, inflationPct: 3 })[0];
  check("below the threshold there is no surcharge", under.irmaaNote === "");
  check("just over the threshold costs more than under it", justOver.totalAnnual > under.totalAnnual);
  check(
    "and far over costs substantially more than just over — the cliffs are graded",
    wayOver.totalAnnual > justOver.totalAnnual * 1.3,
    `${justOver.totalAnnual} vs ${wayOver.totalAnnual}`
  );

  // ---- 7. the tax year is stated -----------------------------------------
  check("the tax year is declared rather than implied", TAX_YEAR === 2025);
  check(
    "and the brackets match it — the 10% band tops out at $23,850",
    estimateTaxMFJ(30_000 + 23_850) > 0 && near(estimateTaxMFJ(30_000 + 23_850), 2385, 1),
    String(Math.round(estimateTaxMFJ(30_000 + 23_850)))
  );

  // ---- 8. the RMD is taxed at the margin ---------------------------------
  const stacked = projectRMDs({ taxDeferredBalance: 2_000_000, currentAge: 62, returnPct: 7, yearsToProject: 20, startYear: 2044, otherTaxableIncome: 60_000 });
  const alone = projectRMDs({ taxDeferredBalance: 2_000_000, currentAge: 62, returnPct: 7, yearsToProject: 20, startYear: 2044 });
  const s73 = stacked.find((r) => r.age >= RMD_START_AGE)!;
  const a73 = alone.find((r) => r.age >= RMD_START_AGE)!;
  check("the distribution itself is unchanged", s73.rmdAmount === a73.rmdAmount);
  check(
    "but stacked on Social Security it is taxed more than in isolation",
    s73.taxEstimate > a73.taxEstimate * 1.3,
    `${s73.taxEstimate} vs ${a73.taxEstimate}`
  );

  // ---- 9. HSA catch-up begins at 55 --------------------------------------
  const hsa = calculateCatchUpImpact({ currentAge: 50, retirementAge: 65, returnPct: 7, accountType: "hsa" });
  check("no HSA catch-up at 50", hsa.find((r) => r.age === 50)!.catchUpAmount === 0);
  check("no HSA catch-up at 54", hsa.find((r) => r.age === 54)!.catchUpAmount === 0);
  check("HSA catch-up at 55", hsa.find((r) => r.age === 55)!.catchUpAmount === 1000);
  check(
    "and an HSA gets no 60-63 enhancement",
    hsa.find((r) => r.age === 61)!.catchUpAmount === 1000,
    String(hsa.find((r) => r.age === 61)!.catchUpAmount)
  );
  const k = calculateCatchUpImpact({ currentAge: 50, retirementAge: 65, returnPct: 7, accountType: "401k" });
  check("a 401k does get it, at 50 and again at 60", k.find((r) => r.age === 50)!.catchUpAmount === 7500 && k.find((r) => r.age === 61)!.catchUpAmount === 11250);

  // ---- 10. the stress test's withdrawal rises ----------------------------
  const flat = calculateSequenceRisk({ portfolioAtRetirement: 2_000_000, annualWithdrawal: 80_000, years: 30 });
  const rising = calculateSequenceRisk({ portfolioAtRetirement: 2_000_000, annualWithdrawal: 80_000, years: 30, inflationPct: 3 });
  check(
    "an inflating withdrawal ends materially lower than a flat one",
    rising[0].endBalance < flat[0].endBalance * 0.6,
    `${rising[0].endBalance} vs ${flat[0].endBalance}`
  );

  // ---- 2 & 3. the Roth ladder ---------------------------------------------
  const noSSYet = calculateRothConversionLadder({
    currentAge: 44, retirementAge: 62, rmdStartAge: RMD_START_AGE,
    taxDeferredBalance: 2_000_000, rothBalance: 100_000,
    otherTaxableIncomeForAge: (age) => (age >= 70 ? 60_000 : 0),
    returnPct: 6, targetBracketRate: 0.22, startYear: 2026,
  });
  const alwaysSS = calculateRothConversionLadder({
    currentAge: 44, retirementAge: 62, rmdStartAge: RMD_START_AGE,
    taxDeferredBalance: 2_000_000, rothBalance: 100_000,
    otherTaxableIncomeForAge: () => 60_000,
    returnPct: 6, targetBracketRate: 0.22, startYear: 2026,
  });
  check(
    "conversion room is larger in the years before Social Security starts",
    noSSYet[0].optimalConversionAmount > alwaysSS[0].optimalConversionAmount,
    `${noSSYet[0].optimalConversionAmount} vs ${alwaysSS[0].optimalConversionAmount}`
  );
  check(
    "which is the whole point of the strategy, so the total converted is higher",
    noSSYet[noSSYet.length - 1].cumulativeConverted > alwaysSS[alwaysSS.length - 1].cumulativeConverted
  );
  check("the window opens at retirement", noSSYet[0].age === 62, String(noSSYet[0].age));
  check("and closes before RMDs begin", noSSYet[noSSYet.length - 1].age === RMD_START_AGE - 1);

  // ---- unchanged ground truth ---------------------------------------------
  check("the RMD divisor at 73 is still 26.5", near(calculateRMD(1_000_000, 73), 1_000_000 / 26.5, 0.01));
  check("nothing is required before 73", calculateRMD(5_000_000, 72) === 0);

  console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILED`);
  return failures;
}

process.exit(main() === 0 ? 0 : 1);
