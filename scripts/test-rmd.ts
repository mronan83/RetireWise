/**
 * Required minimum distributions, and the row the headline figures read.
 *
 * The analytics page took rmds[0] for "First RMD (Age 73)". The projection
 * starts at RETIREMENT age, so rmds[0] is the row for whatever age someone
 * retires at — where no distribution is required and the balance has not yet
 * grown. Both figures were labelled with an age they did not describe, which
 * is the kind of wrong that looks right: the number is real, just from a
 * different year.
 */
import {
  RMD_START_AGE,
  calculateRMD,
  projectRMDs,
} from "../src/lib/utils/financial-analytics";

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${ok || !detail ? "" : ` — ${detail}`}`);
  if (!ok) failures++;
}

function main() {
  // ---- the calculation itself --------------------------------------------
  check("no distribution is required before the start age", calculateRMD(2_000_000, 72) === 0);
  check("nor at any earlier age", calculateRMD(2_000_000, 62) === 0);
  check(
    "at 73 the balance is divided by 26.5, per the Uniform Lifetime Table",
    Math.round(calculateRMD(1_991_110, 73)) === Math.round(1_991_110 / 26.5),
    String(Math.round(calculateRMD(1_991_110, 73)))
  );
  check(
    "the required fraction rises with age",
    calculateRMD(1_000_000, 85) > calculateRMD(1_000_000, 73)
  );

  // ---- the row the page must read ----------------------------------------
  // Someone retiring at 62 with a projection that starts there.
  const rmds = projectRMDs({
    taxDeferredBalance: 1_000_000,
    currentAge: 62,
    returnPct: 6,
    yearsToProject: 30,
    startYear: 2040,
  });

  check("the projection starts at retirement age", rmds[0]?.age === 62, String(rmds[0]?.age));
  check(
    "so the first row requires nothing — which is what made the page read $0",
    rmds[0]?.rmdAmount === 0
  );

  const first = rmds.find((r) => r.age >= RMD_START_AGE);
  check("a row exists for the start age", first?.age === RMD_START_AGE, String(first?.age));
  check(
    "and it requires a real distribution",
    (first?.rmdAmount ?? 0) > 0,
    String(first?.rmdAmount)
  );
  check(
    "its balance has grown past the retirement-age balance, so the two are not interchangeable",
    (first?.beginningBalance ?? 0) > (rmds[0]?.beginningBalance ?? 0),
    `${first?.beginningBalance} vs ${rmds[0]?.beginningBalance}`
  );
  check(
    "the distribution matches the table applied to that year's balance",
    Math.abs((first?.rmdAmount ?? 0) - (first?.beginningBalance ?? 0) / 26.5) <= 1,
    `${first?.rmdAmount} vs ${Math.round((first?.beginningBalance ?? 0) / 26.5)}`
  );

  // ---- someone who is already past the start age --------------------------
  const late = projectRMDs({
    taxDeferredBalance: 800_000,
    currentAge: 75,
    returnPct: 5,
    yearsToProject: 10,
    startYear: 2026,
  });
  const lateFirst = late.find((r) => r.age >= RMD_START_AGE);
  check(
    "someone already past 73 gets their current year, not a row that does not exist",
    lateFirst?.age === 75 && (lateFirst?.rmdAmount ?? 0) > 0,
    `${lateFirst?.age}`
  );

  // ---- and the chart's filter agrees with the headline --------------------
  const charted = rmds.filter((r) => r.rmdAmount > 0);
  check(
    "the first bar on the chart is the same year as the headline figure",
    charted[0]?.age === first?.age,
    `${charted[0]?.age} vs ${first?.age}`
  );

  console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILED`);
  return failures;
}

process.exit(main() === 0 ? 0 : 1);
