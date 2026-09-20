/**
 * Staleness reporting.
 *
 * This is the app's most dangerous failure mode because it does not look like
 * one: a balance from eight months ago renders identically to one from this
 * morning, in the same typeface, with the same confident number. Every
 * assertion below is about telling those two apart.
 */
import {
  freshnessOf,
  hoursSince,
  newestOf,
  oldestOf,
  relativeAge,
} from "../src/lib/utils/freshness";

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${ok || !detail ? "" : ` — ${detail}`}`);
  if (!ok) failures++;
}

const NOW = new Date("2026-09-20T12:00:00Z").getTime();
const ago = (hours: number) => new Date(NOW - hours * 3_600_000);

function main() {
  // ---- never updated is its own state ------------------------------------
  check("a null timestamp is unknown, not stale", freshnessOf(null, "price", NOW) === "unknown");
  check("...and reads as 'never'", relativeAge(null, NOW) === "never");
  check("an unparseable date is unknown", freshnessOf("not a date", "price", NOW) === "unknown");
  check("hoursSince(null) is null, not zero", hoursSince(null, NOW) === null);

  // ---- prices tolerate a weekend but not a week ---------------------------
  check("a price from this morning is fresh", freshnessOf(ago(4), "price", NOW) === "fresh");
  check(
    "a price spanning a weekend is still fresh",
    freshnessOf(ago(30), "price", NOW) === "fresh",
    freshnessOf(ago(30), "price", NOW)
  );
  check("a price from three days ago is aging", freshnessOf(ago(72), "price", NOW) === "aging");
  check("a price from a week ago is stale", freshnessOf(ago(24 * 7), "price", NOW) === "stale");

  // ---- a typed figure ages far more slowly --------------------------------
  // One shared threshold would either cry wolf here or stay silent above.
  check(
    "a manual balance from a week ago is still fresh",
    freshnessOf(ago(24 * 7), "manual_balance", NOW) === "fresh"
  );
  check(
    "a manual balance from two months ago is aging",
    freshnessOf(ago(24 * 60), "manual_balance", NOW) === "aging"
  );
  check(
    "a manual balance from eight months ago is stale",
    freshnessOf(ago(24 * 240), "manual_balance", NOW) === "stale"
  );
  check(
    "the same age means different things for a price and a typed figure",
    freshnessOf(ago(24 * 7), "price", NOW) === "stale" &&
      freshnessOf(ago(24 * 7), "manual_balance", NOW) === "fresh"
  );

  // ---- property does not move weekly --------------------------------------
  check(
    "a valuation from four months ago is fresh",
    freshnessOf(ago(24 * 120), "valuation", NOW) === "fresh"
  );
  check(
    "a valuation from two years ago is stale",
    freshnessOf(ago(24 * 730), "valuation", NOW) === "stale"
  );

  // ---- a total is as old as its worst input -------------------------------
  // The whole reason oldestOf exists. Nine positions priced this morning and
  // one priced last month is not a fresh total.
  const mixed = [ago(2), ago(3), ago(24 * 30), ago(1)];
  check(
    "oldestOf picks the stalest, which is what a total inherits",
    oldestOf(mixed)?.getTime() === ago(24 * 30).getTime()
  );
  check("newestOf picks the freshest", newestOf(mixed)?.getTime() === ago(1).getTime());
  check(
    "a total built from a month-old price is reported stale, not fresh",
    freshnessOf(oldestOf(mixed), "price", NOW) === "stale"
  );
  check("nulls are skipped rather than treated as now", oldestOf([null, ago(5)])?.getTime() === ago(5).getTime());
  check("all-null gives null", oldestOf([null, undefined]) === null);
  check("an empty list gives null", oldestOf([]) === null);

  // ---- wording ------------------------------------------------------------
  check("under an hour reads in minutes", relativeAge(ago(0.5), NOW) === "30 min ago");
  check("hours read as hours", relativeAge(ago(5), NOW) === "5 hours ago");
  check("one day reads as yesterday", relativeAge(ago(25), NOW) === "yesterday");
  check("days read as days", relativeAge(ago(24 * 5), NOW) === "5 days ago");
  check("months read as months", relativeAge(ago(24 * 70), NOW) === "2 months ago");
  check("a year or more reads as such", relativeAge(ago(24 * 400), NOW) === "over a year ago");
  check(
    "a clock skewed into the future does not read as negative",
    relativeAge(new Date(NOW + 60_000), NOW) === "just now"
  );

  console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILED`);
  return failures;
}

process.exit(main() === 0 ? 0 : 1);
