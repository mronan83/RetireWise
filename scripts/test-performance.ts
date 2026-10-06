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
import { dailyChange, marketDay } from "../src/lib/performance/daily-change";
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

  // ---- the dashboard's daily change, at the latest prices ------------------
  // It was the evening snapshot's total less the one before: it held all day
  // whatever Refresh Prices fetched, and a deposit counted as gain.
  const close = [
    { accountId: "a", ticker: "VTI", price: 300 },
    { accountId: "a", ticker: "BND", price: 72 },
    { accountId: "b", ticker: "VTI", price: 300 },
  ];
  const day = dailyChange(
    [
      { accountId: "a", ticker: "VTI", shares: 100, price: 303 },
      { accountId: "a", ticker: "BND", shares: 50, price: 71.5 },
      { accountId: "b", ticker: "VTI", shares: 10, price: 303 },
    ],
    close
  );
  check(
    "each position's shares times its move since the close: +$300 − $25 + $30 = +$305",
    near(day.change, 305) && near(day.valueAtClose, 30_000 + 3_600 + 3_000),
    `${day.change} on ${day.valueAtClose}`
  );
  check("as a share of those positions at the close", near(day.changePct!, (305 / 36_600) * 100), String(day.changePct));
  const refreshed = dailyChange(
    [{ accountId: "a", ticker: "VTI", shares: 100, price: 306 }, { accountId: "a", ticker: "BND", shares: 50, price: 71.5 }, { accountId: "b", ticker: "VTI", shares: 10, price: 303 }],
    close
  );
  check("a refresh that moves a price moves the change with it", near(refreshed.change, 605), String(refreshed.change));
  const deposit = dailyChange(
    [{ accountId: "a", ticker: "VTI", shares: 110, price: 300 }, { accountId: "a", ticker: "SPAXX", shares: 5_000, price: 1 }],
    close
  );
  check(
    "money paid in is not a gain: ten more shares and a new cash position at unchanged prices read as nothing",
    near(deposit.change, 0) && deposit.newSinceClose === 1,
    `${deposit.change}, ${deposit.newSinceClose} new`
  );
  check("nothing to measure from gives no percentage, not infinity", dailyChange([], close).changePct === null);
  const unpriced = dailyChange([{ accountId: "a", ticker: "VTI", shares: 100, price: 0 }], close);
  check("a position with no price is left out rather than read as a total loss", near(unpriced.change, 0), String(unpriced.change));

  // The market day, in New York.
  check("a Tuesday afternoon in New York is Tuesday", marketDay(new Date("2026-10-06T19:00:00Z")) === "2026-10-06");
  check(
    "Tuesday 9 pm in New York is still Tuesday, though it is Wednesday in UTC",
    marketDay(new Date("2026-10-07T01:00:00Z")) === "2026-10-06"
  );
  check("a Saturday shows Friday's move", marketDay(new Date("2026-10-10T15:00:00Z")) === "2026-10-09");
  check("and so does a Sunday", marketDay(new Date("2026-10-11T15:00:00Z")) === "2026-10-09");

  console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILED`);
  return failures;
}

process.exit(main() === 0 ? 0 : 1);
