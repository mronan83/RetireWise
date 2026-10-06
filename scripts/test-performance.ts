/**
 * Performance, and the difference between a return and a balance change.
 *
 * The account cards showed (value_now - value_then) / value_then. That is
 * how much more is in the account, not how the investments did: a
 * contribution raises the balance and therefore raises the figure. On a
 * 401(k) taking biweekly deferrals, a meaningful share of what was
 * presented as performance was the owner's own paycheck.
 *
 * Fixing it needed no transaction feed. Shares that rise without the market
 * rising were bought, and the cash that bought them is an external flow to
 * exclude. Every assertion below is written as the wrong behaviour, so a
 * regression reads as the old number coming back.
 */
import { dailyChange } from "../src/lib/performance/daily-change";
import { closeOn } from "../src/lib/utils/market-session";
import {
  addDays,
  flowBetween,
  timeWeightedReturn,
  twrSince,
  type AccountDay,
} from "../src/lib/performance/twr";

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${ok || !detail ? "" : ` — ${detail}`}`);
  if (!ok) failures++;
}
const near = (a: number, b: number, tol = 1e-6) => Math.abs(a - b) < tol;

function main() {
  // ---- the bug, stated as arithmetic --------------------------------------
  // $10,000 grows 10% to $11,000, and $1,000 is paid in. The balance is
  // $12,000: a 20% rise, of which only half was the market.
  const withContribution: AccountDay[] = [
    { date: "2026-01-01", value: 10_000, positions: [{ ticker: "VOO", shares: 100, price: 100 }] },
    { date: "2026-01-02", value: 12_000, positions: [{ ticker: "VOO", shares: 109.0909091, price: 110 }] },
  ];
  const balanceChange = ((12_000 - 10_000) / 10_000) * 100;
  check("the old figure would have read +20%", near(balanceChange, 20));

  const twr = timeWeightedReturn(withContribution);
  check(
    "the return is 10%, because the other half was money paid in",
    twr !== null && near(twr.pct, 10, 0.01),
    twr ? `${twr.pct.toFixed(4)}%` : "null"
  );
  check(
    "and the contribution is reported as a flow, not as growth",
    twr !== null && near(twr.netFlow, 1000, 0.01),
    twr ? String(Math.round(twr.netFlow)) : "null"
  );

  // ---- a withdrawal must not read as a loss -------------------------------
  const withWithdrawal: AccountDay[] = [
    { date: "2026-01-01", value: 10_000, positions: [{ ticker: "VOO", shares: 100, price: 100 }] },
    { date: "2026-01-02", value: 8_250, positions: [{ ticker: "VOO", shares: 75, price: 110 }] },
  ];
  const wTwr = timeWeightedReturn(withWithdrawal);
  check(
    "selling a quarter of the position is not a 17.5% loss",
    wTwr !== null && near(wTwr.pct, 10, 0.01),
    wTwr ? `${wTwr.pct.toFixed(4)}%` : "null"
  );
  check("and the withdrawal is a negative flow", wTwr !== null && wTwr.netFlow < 0);

  // ---- with no flows it must equal the plain calculation ------------------
  // This is what makes it safe to apply to history recorded before share
  // counts were kept: an account receiving nothing is measured identically.
  const noFlows: AccountDay[] = [
    { date: "2026-01-01", value: 10_000, positions: [{ ticker: "X", shares: 100, price: 100 }] },
    { date: "2026-01-02", value: 10_500, positions: [{ ticker: "X", shares: 100, price: 105 }] },
    { date: "2026-01-03", value: 11_000, positions: [{ ticker: "X", shares: 100, price: 110 }] },
  ];
  const flat = timeWeightedReturn(noFlows);
  check(
    "no flows reduces exactly to (end - start) / start",
    flat !== null && near(flat.pct, 10, 1e-9),
    flat ? `${flat.pct}%` : "null"
  );
  check("and reports no net flow", flat !== null && near(flat.netFlow, 0));

  // ---- chain-linking ------------------------------------------------------
  // +10% then -10% is -1%, not 0%. A naive endpoint calculation gets this
  // right too, but only because there are no flows in between.
  const upDown: AccountDay[] = [
    { date: "2026-01-01", value: 1000, positions: [] },
    { date: "2026-01-02", value: 1100, positions: [] },
    { date: "2026-01-03", value: 990, positions: [] },
  ];
  const ud = timeWeightedReturn(upDown);
  check("a 10% gain then a 10% loss is -1%", ud !== null && near(ud.pct, -1, 1e-9));

  // The case only chain-linking gets right: a large contribution lands
  // between two moves, so the endpoint calculation weights them wrongly.
  const flowMidway: AccountDay[] = [
    { date: "2026-01-01", value: 1000, positions: [{ ticker: "X", shares: 10, price: 100 }] },
    { date: "2026-01-02", value: 1100, positions: [{ ticker: "X", shares: 10, price: 110 }] },
    { date: "2026-01-03", value: 11_000, positions: [{ ticker: "X", shares: 100, price: 110 }] },
    { date: "2026-01-04", value: 12_100, positions: [{ ticker: "X", shares: 100, price: 121 }] },
  ];
  const fm = timeWeightedReturn(flowMidway);
  // 1.10 * 1.00 * 1.10 = 1.21
  check(
    "a tenfold contribution midway does not distort the return",
    fm !== null && near(fm.pct, 21, 0.01),
    fm ? `${fm.pct.toFixed(4)}%` : "null"
  );
  check(
    "the old figure would have claimed +1110%",
    near(((12_100 - 1000) / 1000) * 100, 1110)
  );

  // ---- flow detection -----------------------------------------------------
  check(
    "a new ticker is a purchase of all its shares",
    flowBetween([], [{ ticker: "NEW", shares: 10, price: 50 }]) === 500
  );
  check(
    "a vanished ticker is a full sale",
    flowBetween([{ ticker: "OLD", shares: 10, price: 50 }], []) === -500
  );
  check(
    "a price move with no share change is not a flow",
    flowBetween(
      [{ ticker: "X", shares: 10, price: 50 }],
      [{ ticker: "X", shares: 10, price: 80 }]
    ) === 0
  );
  check(
    "flows are unknown when either day's positions were not recorded",
    flowBetween(undefined, [{ ticker: "X", shares: 1, price: 1 }]) === null &&
      flowBetween([{ ticker: "X", shares: 1, price: 1 }], undefined) === null
  );

  // ---- history older than the share record --------------------------------
  const partial: AccountDay[] = [
    { date: "2026-01-01", value: 1000 },
    { date: "2026-01-02", value: 1100 },
    { date: "2026-01-03", value: 1100, positions: [{ ticker: "X", shares: 10, price: 110 }] },
    { date: "2026-01-04", value: 1210, positions: [{ ticker: "X", shares: 10, price: 121 }] },
  ];
  const p = timeWeightedReturn(partial);
  check("history without share counts still produces a figure", p !== null);
  check("but it says the flows were not all knowable", p !== null && p.hasUnknownFlows);
  check(
    "and names the date from which they were",
    p !== null && p.flowsKnownFrom === "2026-01-03",
    p?.flowsKnownFrom ?? "null"
  );

  // ---- a period is not a point --------------------------------------------
  check("one day is not a period", timeWeightedReturn([{ date: "2026-01-01", value: 100 }]) === null);
  check("and neither is none", timeWeightedReturn([]) === null);

  // ---- windows the record cannot reach ------------------------------------
  // Molina/Slalom as stored: snapshots begin 2026-04-20.
  const fiveMonths: AccountDay[] = [
    { date: "2026-04-20", value: 66_478.02 },
    { date: "2026-09-18", value: 67_863.61 },
  ];
  check("ten years is refused", twrSince(fiveMonths, "2016-09-20") === null);
  check("five years is refused", twrSince(fiveMonths, "2021-09-20") === null);
  check("one year is refused", twrSince(fiveMonths, "2025-09-20") === null);
  check("year-to-date is refused, the record starting in April", twrSince(fiveMonths, "2026-01-01") === null);
  const ninety = twrSince(fiveMonths, "2026-06-22");
  check("ninety days is answered", ninety !== null, ninety ? `${ninety.pct.toFixed(2)}%` : "null");

  check(
    "a boundary two days before the record still counts",
    twrSince(fiveMonths, "2026-04-18") !== null
  );
  check(
    "a boundary a month before does not",
    twrSince(fiveMonths, "2026-03-18") === null
  );

  // ---- the period opens at the close on or before the boundary ------------
  const series: AccountDay[] = [
    { date: "2026-01-01", value: 100 },
    { date: "2026-02-01", value: 200 },
    { date: "2026-03-01", value: 300 },
  ];
  const fromFeb = twrSince(series, "2026-02-01");
  check(
    "a period starting mid-series measures from that day's close",
    fromFeb !== null && near(fromFeb.pct, 50, 1e-9),
    fromFeb ? `${fromFeb.pct}%` : "null"
  );

  // ---- arithmetic guards --------------------------------------------------
  check("dates roll across a month boundary", addDays("2026-01-30", 3) === "2026-02-02");
  check("and across a year", addDays("2026-12-30", 3) === "2027-01-02");
  const zeroStart = timeWeightedReturn([
    { date: "2026-01-01", value: 0 },
    { date: "2026-01-02", value: 100 },
  ]);
  check("an account starting at zero yields no return, not infinity", zeroStart === null);

  // ---- the dashboard's daily change, by the session each price is from ----
  // It measured every position against one evening snapshot, so a mutual
  // fund, which posts after the close, had its move added to the next day.
  const TUE_NOON = "2026-10-06T16:00:00Z"; // an ETF refreshed at noon in New York
  const MON_NAV = "2026-10-06T12:10:00Z"; // a fund's Monday price, stamped before Tuesday's open
  const held = [
    { shares: 100, price: 303, previousClose: 300, priceAsOf: TUE_NOON }, // VTI +$300
    { shares: 50, price: 71.5, previousClose: 72, priceAsOf: TUE_NOON }, // BND −$25
    { shares: 10, price: 510, previousClose: 500, priceAsOf: MON_NAV }, // a fund, +$100 on Monday
    { shares: 10, price: 20, previousClose: 19, priceAsOf: closeOn("2026-10-01") }, // a bank price from last Thursday
    { shares: 5, price: 10, previousClose: null, priceAsOf: TUE_NOON }, // typed by hand
  ];
  const day = dailyChange(held);
  check(
    "Tuesday's figure is the positions priced on Tuesday: +$300 − $25 = +$275",
    day.latest?.session === "2026-10-06" && near(day.latest.change, 275) && day.latest.positions === 2,
    JSON.stringify(day.latest)
  );
  check("as a share of those positions at Monday's close", near(day.latest!.changePct!, (275 / 33_600) * 100), String(day.latest?.changePct));
  check(
    "the fund's move is Monday's, shown beside Tuesday's rather than inside it",
    day.dayBehind?.session === "2026-10-05" && near(day.dayBehind.change, 100) && day.dayBehind.positions === 1,
    JSON.stringify(day.dayBehind)
  );
  check("a price from days before is left out, not shown as a day's move", day.older === 1, String(day.older));
  check("a price with no previous close is counted as not measured", day.unmeasured === 1, String(day.unmeasured));

  const refreshed = dailyChange(held.map((p, i) => (i === 0 ? { ...p, price: 306 } : p)));
  check("a refresh that moves a price moves the change with it", near(refreshed.latest!.change, 575), String(refreshed.latest?.change));
  const posted = dailyChange(
    held.map((p, i) => (i === 2 ? { ...p, price: 505, previousClose: 510, priceAsOf: "2026-10-07T12:10:00Z" } : p))
  );
  check(
    "once the fund posts Tuesday's price, its move joins Tuesday's: +$275 − $50",
    near(posted.latest!.change, 225) && posted.latest!.positions === 3 && posted.dayBehind === null,
    JSON.stringify(posted)
  );
  const deposit = dailyChange(held.slice(0, 2).map((p) => ({ ...p, shares: p.shares + 10, price: p.previousClose! })));
  check("money paid in is not a gain: more shares at unchanged prices read as nothing", near(deposit.latest!.change, 0), String(deposit.latest?.change));
  const preOpen = dailyChange([
    { shares: 100, price: 303, previousClose: 300, priceAsOf: closeOn("2026-10-05") },
    { shares: 10, price: 510, previousClose: 500, priceAsOf: MON_NAV },
  ]);
  check(
    "before Tuesday's open everything is Monday's, the fund included once it has posted",
    preOpen.latest?.session === "2026-10-05" && near(preOpen.latest.change, 400) && preOpen.dayBehind === null,
    JSON.stringify(preOpen)
  );
  const fresh = dailyChange([{ shares: 5, price: 10, previousClose: null, priceAsOf: TUE_NOON }]);
  check("with no previous close anywhere there is no figure, not a zero", fresh.latest === null && fresh.unmeasured === 1);
  check("nothing to measure from gives no percentage, not infinity", dailyChange([{ shares: 1, price: 5, previousClose: 5, priceAsOf: TUE_NOON }]).latest?.changePct !== Infinity);
  const unpriced = dailyChange([{ shares: 100, price: 0, previousClose: 300, priceAsOf: TUE_NOON }]);
  check("a position with no price is left out rather than read as a total loss", unpriced.latest === null && unpriced.unmeasured === 0);

  console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILED`);
  return failures;
}

process.exit(main() === 0 ? 0 : 1);
