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
import {
  closeOn,
  resolvePriceUpdate,
  sessionBefore,
  sessionOf,
  sessionsBetween,
  typedPriceUpdate,
} from "../src/lib/utils/market-session";
import { quoteFrom } from "../src/lib/utils/price-feed";

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

  // ---- a price is as old as the session it was struck in -----------------
  // October 2026: Monday the 5th to Friday the 9th, Eastern daylight time.
  check("a price at 11 am on Tuesday belongs to Tuesday", sessionOf("2026-10-06T15:00:00Z") === "2026-10-06");
  check("one after Tuesday's close is still Tuesday's", sessionOf("2026-10-06T23:30:00Z") === "2026-10-06");
  check(
    "a fund price stamped before Tuesday's open is Monday's",
    sessionOf("2026-10-06T12:10:00Z") === "2026-10-05",
    sessionOf("2026-10-06T12:10:00Z")
  );
  check("a weekend belongs to Friday", sessionOf("2026-10-10T18:00:00Z") === "2026-10-09" && sessionOf("2026-10-11T18:00:00Z") === "2026-10-09");
  check("Monday before the open is still Friday", sessionOf("2026-10-12T13:00:00Z") === "2026-10-09");
  check("winter time is New York's too", sessionOf("2026-12-08T14:20:00Z") === "2026-12-07" && sessionOf("2026-12-08T14:40:00Z") === "2026-12-08");
  check("a weekend adds no sessions", sessionsBetween("2026-10-09", "2026-10-12") === 1);
  check("no sessions run backwards", sessionsBetween("2026-10-09", "2026-10-05") === 0);
  check("the session before Monday is Friday", sessionBefore("2026-10-12") === "2026-10-09");
  check("a date's close is 4 pm in New York", closeOn("2026-10-05").toISOString() === "2026-10-05T20:00:00.000Z");
  check("in winter too", closeOn("2026-12-07").toISOString() === "2026-12-07T21:00:00.000Z");

  const at = (iso: string) => new Date(iso).getTime();
  check(
    "a fund's Monday price is current at Tuesday noon, the newest it can be",
    freshnessOf("2026-10-06T12:10:00Z", "price", at("2026-10-06T16:00:00Z")) === "fresh"
  );
  check(
    "Friday's close is current on Monday afternoon, which seventy hours called aging",
    freshnessOf(closeOn("2026-10-09"), "price", at("2026-10-12T18:00:00Z")) === "fresh"
  );
  check(
    "Monday's close is aging on Wednesday afternoon",
    freshnessOf(closeOn("2026-10-05"), "price", at("2026-10-07T18:00:00Z")) === "aging"
  );
  check(
    "and stale on Thursday",
    freshnessOf(closeOn("2026-10-05"), "price", at("2026-10-08T18:00:00Z")) === "stale"
  );

  // ---- a quote is dated by the market, not by the fetch ---------------------
  const fetched = new Date("2026-10-06T16:00:00Z");
  const fund = quoteFrom(
    { regularMarketPrice: 510, regularMarketTime: new Date("2026-10-06T12:10:00Z"), regularMarketPreviousClose: 500 },
    fetched
  );
  check(
    "a fund fetched at noon keeps Yahoo's morning stamp, so it reads as Monday's",
    fund?.at.toISOString() === "2026-10-06T12:10:00.000Z" && sessionOf(fund.at) === "2026-10-05" && fund.previousClose === 500,
    JSON.stringify(fund)
  );
  check(
    "epoch seconds are read as seconds",
    quoteFrom({ regularMarketPrice: 1, regularMarketTime: 1_791_288_000 }, fetched)?.at.toISOString() === "2026-10-06T12:00:00.000Z"
  );
  check("a quote with no time of its own is dated when it was fetched", quoteFrom({ regularMarketPrice: 5 }, fetched)?.at === fetched);
  check(
    "and never later than that",
    quoteFrom({ regularMarketPrice: 5, regularMarketTime: new Date("2026-10-07T00:00:00Z") }, fetched)?.at === fetched
  );
  check("no price is no quote", quoteFrom({ regularMarketPrice: null }, fetched) === null && quoteFrom({ regularMarketPrice: 0 }, fetched) === null);

  // ---- which price a holding keeps ----------------------------------------
  const monClose = closeOn("2026-10-05");
  const tueClose = closeOn("2026-10-06");
  const stored = { price: 300, at: tueClose, previousClose: 297 };
  check(
    "the bank's Monday close does not replace Tuesday's price from Refresh Prices",
    resolvePriceUpdate({ price: 299, at: monClose }, stored) === null
  );
  const bankNext = resolvePriceUpdate({ price: 305, at: closeOn("2026-10-07") }, stored);
  check(
    "the bank's next close takes the stored one as its previous close",
    bankNext?.price === 305 && bankNext.previousClose === 300 && bankNext.at.getTime() === closeOn("2026-10-07").getTime(),
    JSON.stringify(bankNext)
  );
  const afterGap = resolvePriceUpdate({ price: 310, at: closeOn("2026-10-08") }, stored);
  check(
    "across a missed session there is no previous close, rather than two days' move read as one",
    afterGap?.price === 310 && afterGap.previousClose === null,
    JSON.stringify(afterGap)
  );
  check(
    "over a weekend Friday's close is Monday's previous close",
    resolvePriceUpdate({ price: 101, at: closeOn("2026-10-12") }, { price: 100, at: closeOn("2026-10-09"), previousClose: null })?.previousClose === 100
  );
  const yahoo = resolvePriceUpdate({ price: 306, at: new Date("2026-10-07T15:00:00Z"), previousClose: 300.5 }, stored);
  check("Yahoo's own previous close is taken over the stored price", yahoo?.previousClose === 300.5, JSON.stringify(yahoo));
  const sameDay = resolvePriceUpdate({ price: 301, at: new Date("2026-10-06T21:00:00Z") }, stored);
  check(
    "a later price from the same session replaces it and keeps the previous close",
    sameDay?.price === 301 && sameDay.previousClose === 297,
    JSON.stringify(sameDay)
  );
  const earlierSameDay = resolvePriceUpdate({ price: 299, at: new Date("2026-10-06T15:00:00Z"), previousClose: 296 }, stored);
  check("an earlier price from the same session keeps the stored one", earlierSameDay === null, JSON.stringify(earlierSameDay));
  const bankEarlierSameDay = resolvePriceUpdate({ price: 299, at: new Date("2026-10-06T15:00:00Z") }, { ...stored, previousClose: null });
  check(
    "and so does one from the bank, which brings no previous close",
    bankEarlierSameDay === null,
    JSON.stringify(bankEarlierSameDay)
  );
  // A fund refreshed on Tuesday afternoon before this change was stamped with
  // that time, though its price was Monday's. Yahoo's Monday quote, stamped
  // before Tuesday's open, must still be able to replace it.
  const legacy = resolvePriceUpdate(
    { price: 510, at: new Date("2026-10-06T12:10:00Z"), previousClose: 500 },
    { price: 510, at: new Date("2026-10-06T18:00:00Z"), previousClose: null }
  );
  check(
    "a price with no previous close gives way to a quote that has one, whatever its date said",
    legacy?.at.toISOString() === "2026-10-06T12:10:00.000Z" && legacy.previousClose === 500,
    JSON.stringify(legacy)
  );
  check(
    "a first price has whatever previous close its source knows",
    resolvePriceUpdate({ price: 50, at: tueClose }, null)?.previousClose === null &&
      resolvePriceUpdate({ price: 50, at: tueClose, previousClose: 49 }, null)?.previousClose === 49
  );

  // ---- a price typed by hand ----------------------------------------------
  const typed = typedPriceUpdate(12.5, "12.0000");
  check(
    "a new price typed in is dated now, with no previous close",
    "lastPriceUpdate" in typed && typed.previousClose === null
  );
  check(
    "saving a holding with its price unchanged leaves the price's date alone",
    Object.keys(typedPriceUpdate(12, "12.0000")).length === 0
  );

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
