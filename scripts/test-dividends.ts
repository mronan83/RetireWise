/**
 * Dividend income, and the four ways a yield table reported one that was
 * never paid.
 *
 * The old tool multiplied each position's current value by a hardcoded
 * yield: `VTI: 1.3, VOO: 1.3, BND: 3.5`, and for any ticker the table had
 * never heard of — which is nearly every fund in an employer plan — a
 * per-asset-class default of 1.5%. It could not return "unknown", so:
 *
 *   1. A household whose custodians report no distributions at all still
 *      received a confident annual figure.
 *   2. An account linked a fortnight ago was given a full year's income.
 *   3. Reinvested distributions and spendable cash were one number, so 80%
 *      of this household's total read as income available to live on.
 *   4. $838.81 of real distributions carried no ticker and would have been
 *      dropped, while the total still looked complete.
 *
 * Every assertion is written as the bug.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  coversWindow,
  distributionAmount,
  isReinvested,
  payerLabel,
  summarizeDividends,
  addDays,
  type AccountWindow,
  type DistributionRow,
} from "../src/lib/utils/dividends";

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${ok || !detail ? "" : ` — ${detail}`}`);
  if (!ok) failures++;
}

const ASOF = "2026-09-22";

function row(p: Partial<DistributionRow> & { accountId: string; date: string; amount: number }): DistributionRow {
  return {
    ticker: null,
    plaidSecurityId: null,
    description: null,
    shares: null,
    ...p,
  };
}

function account(p: Partial<AccountWindow> & { accountId: string; name: string }): AccountWindow {
  return { owner: "self", earliestTxn: "2024-09-30", value: 10000, ...p };
}

function main() {
  // ---- the sign Plaid stores -----------------------------------------------
  // Cash arriving in the account is negative; all 182 stored rows are.
  check(
    "a dividend stored as -685.75 is income of 685.75",
    distributionAmount(row({ accountId: "a", date: ASOF, amount: -685.75 })) === 685.75
  );
  check(
    "summing the raw column would have reported the year as negative",
    -4988.84 < 0,
    "which is what `sum(amount)` returns for this household"
  );
  check(
    "a positive row is excluded rather than made positive by Math.abs",
    distributionAmount(row({ accountId: "a", date: ASOF, amount: 685.75 })) === null,
    "abs() turns a sign that flipped upstream into income"
  );
  check(
    "a zero row is not income either",
    distributionAmount(row({ accountId: "a", date: ASOF, amount: 0 })) === null
  );
  check(
    "a non-numeric amount does not become NaN in the total",
    distributionAmount(row({ accountId: "a", date: ASOF, amount: "x" as unknown as number })) === null
  );

  // ---- reinvested is not spendable -----------------------------------------
  check(
    "a distribution that bought shares is reinvested",
    isReinvested(row({ accountId: "a", date: ASOF, amount: -10, shares: 0.42 }))
  );
  check(
    "one that settled as cash is not",
    !isReinvested(row({ accountId: "a", date: ASOF, amount: -10, shares: null }))
  );
  check(
    "nor is one recording zero shares",
    !isReinvested(row({ accountId: "a", date: ASOF, amount: -10, shares: 0 }))
  );

  // ---- who paid it ----------------------------------------------------------
  check(
    "a ticker names the payer",
    payerLabel(row({ accountId: "a", date: ASOF, amount: -1, ticker: "VOO" })) === "VOO"
  );
  check(
    "with no ticker the description does",
    payerLabel(
      row({ accountId: "a", date: ASOF, amount: -1, description: "FID TOTAL BOND - dividend" })
    ) === "FID TOTAL BOND",
    "$838.81 of real income would otherwise be dropped"
  );
  check(
    "including the longer Fidelity phrasing",
    payerLabel(
      row({
        accountId: "a",
        date: ASOF,
        amount: -1,
        description:
          "AVANTIS US SMALL CAP VALUE ETF - DIVIDEND RECEIVED AVANTIS US SMALL CAP VALUE ETF (AVUV) (Cash)",
      })
    ) === "AVANTIS US SMALL CAP VALUE ETF"
  );
  check(
    "and a row with neither is nameable rather than silently lost",
    payerLabel(row({ accountId: "a", date: ASOF, amount: -1 })) === null
  );

  // ---- history that does not reach back ------------------------------------
  check(
    "two years of history covers the trailing year",
    coversWindow("2024-09-30", ASOF)
  );
  check(
    "a fortnight does not",
    !coversWindow("2026-09-03", ASOF),
    "the Mutual of Omaha plan: 4 transactions over 15 days"
  );
  check("nor does no history at all", !coversWindow(null, ASOF));
  check(
    "a start a few days inside the boundary is absorbed",
    coversWindow(addDays(ASOF, -WINDOW_MINUS_2), ASOF),
    "weekends and holidays should not disqualify a year"
  );
  check(
    "a start a month inside it is not",
    !coversWindow("2025-10-22", ASOF)
  );

  // ---- the three outcomes must stay distinct -------------------------------
  const accounts = [
    account({ accountId: "slalom", name: "Slalom 401k", value: 70666.43 }),
    account({ accountId: "molina", name: "Molina 401k", value: 21045.35, earliestTxn: "2025-01-21" }),
    account({ accountId: "moo", name: "Mutual of Omaha", value: 1560.23, earliestTxn: "2026-09-03" }),
  ];
  const rows = [
    row({ accountId: "slalom", date: "2026-05-27", amount: -1486.29, ticker: "OIEJX", shares: 12 }),
    row({ accountId: "slalom", date: "2026-08-31", amount: -838.81, description: "FID TOTAL BOND - dividend" }),
  ];
  const s = summarizeDividends(rows, accounts, ASOF);

  const byName = new Map(s.accounts.map((a) => [a.account, a]));
  check(
    "an account with a covered year and distributions reports them",
    byName.get("Slalom 401k")?.status === "reported"
  );
  check(
    "an account with a covered year and none is 'none reported', not zero",
    byName.get("Molina 401k")?.status === "none_reported",
    "18 months of transactions, no distributions — a reporting gap, not a fact about the fund"
  );
  check(
    "and it carries no figure rather than a confident 0",
    byName.get("Molina 401k")?.total === null
  );
  check(
    "an account whose history is too short is named as such",
    byName.get("Mutual of Omaha")?.status === "history_too_short"
  );
  check(
    "and also carries no figure",
    byName.get("Mutual of Omaha")?.total === null
  );
  check(
    "the old table would have given all three a number",
    // value * default us_stock yield of 1.5%
    Math.round(21045.35 * 0.015) === 316,
    "$316/yr for Molina, from a yield that describes no fund it holds"
  );

  // ---- a known figure must not be rendered as nothing ---------------------
  // The mirror of the original bug. Tricia's Roth holds 15 real payments over
  // eight months; refusing to annualise them is right, discarding them is not.
  const partial = summarizeDividends(
    [
      row({ accountId: "tricia", date: "2026-03-17", amount: -13.78, ticker: "SPYM" }),
      row({ accountId: "tricia", date: "2026-06-11", amount: -1.99, ticker: "AVUV" }),
      row({ accountId: "tricia", date: "2026-06-30", amount: -1.55, ticker: "VOO" }),
      row({ accountId: "tricia", date: "2026-07-10", amount: -0.44, ticker: "QQQ" }),
      row({ accountId: "tricia", date: "2026-08-31", amount: -1.17, ticker: "SPAXX" }),
    ],
    [account({ accountId: "tricia", name: "Tricia's Roth", owner: "spouse", earliestTxn: "2026-01-02", value: 3124.58 })],
    ASOF
  );
  const tr = partial.accounts[0];
  check(
    "an account with real distributions but a short history is 'partial window'",
    tr.status === "partial_window",
    tr.status
  );
  check(
    "its real figure is kept, not discarded",
    tr.total !== null && Math.abs(tr.total - 18.93) < 0.01,
    String(tr.total)
  );
  check(
    "but it is excluded from the annual total",
    partial.total === 0,
    "eight months of payments is not a year"
  );
  check(
    "and surfaces where it cannot be mistaken for one",
    Math.abs(partial.observedOutsideWindow - 18.93) < 0.01
  );
  check(
    "no trailing yield is quoted for it",
    tr.trailingYield === null,
    "18.93 over eight months is not 0.61% a year"
  );
  check(
    "the span it was observed over is stated",
    tr.observedFrom === "2026-01-02"
  );

  // ---- the total says what it speaks for -----------------------------------
  check(
    "the total is only the accounts that reported",
    Math.abs(s.total - 2325.1) < 0.01,
    s.total.toFixed(2)
  );
  const expectedCover = 70666.43 / (70666.43 + 21045.35 + 1560.23);
  check(
    "and it is paired with the share of portfolio value it covers",
    Math.abs(s.valueCovered - expectedCover) < 0.0001,
    `${(s.valueCovered * 100).toFixed(1)}%`
  );
  check(
    "which is well short of the whole portfolio",
    s.valueCovered < 0.8,
    "reporting the total alone would overstate coverage by a third"
  );
  check(
    "both gap accounts are named with a reason",
    s.gaps.length === 2 && s.gaps.every((g) => g.reason.length > 20),
    JSON.stringify(s.gaps.map((g) => g.account))
  );

  // ---- reinvested vs cash ---------------------------------------------------
  check(
    "reinvested and cash are reported apart",
    Math.abs(s.reinvested - 1486.29) < 0.01 && Math.abs(s.cash - 838.81) < 0.01
  );
  check(
    "and they add back to the total",
    Math.abs(s.reinvested + s.cash - s.total) < 0.01
  );
  check(
    "the unattributed-by-ticker payment is attributed by name, not dropped",
    s.topPayers.some((p) => p.payer === "FID TOTAL BOND" && Math.abs(p.total - 838.81) < 0.01)
  );

  // ---- the window is a window ----------------------------------------------
  const stale = summarizeDividends(
    [row({ accountId: "slalom", date: "2025-06-20", amount: -510.71, ticker: "VTSNX" })],
    [account({ accountId: "slalom", name: "Slalom 401k" })],
    ASOF
  );
  check(
    "a distribution older than the window is not counted in it",
    stale.total === 0 && stale.accounts[0].status === "none_reported",
    "VTSNX last paid 2025-06-20; the position was sold"
  );
  const future = summarizeDividends(
    [row({ accountId: "slalom", date: "2027-01-01", amount: -100, ticker: "VOO" })],
    [account({ accountId: "slalom", name: "Slalom 401k" })],
    ASOF
  );
  check("nor is one dated after it", future.total === 0);

  // ---- a household with no record at all -----------------------------------
  const empty = summarizeDividends([], [account({ accountId: "x", name: "Demo", earliestTxn: null })], ASOF);
  check(
    "a household with no transactions reports no income, not an estimate",
    empty.total === 0 && empty.accounts[0].total === null
  );
  check(
    "and its coverage is honestly zero",
    empty.valueCovered === 0,
    "the old table would have reported a full year's yield on the whole portfolio"
  );

  // ---- a bad row is counted, not hidden ------------------------------------
  const dirty = summarizeDividends(
    [
      row({ accountId: "slalom", date: "2026-05-27", amount: -100, ticker: "VOO" }),
      row({ accountId: "slalom", date: "2026-05-28", amount: 50, ticker: "VOO" }),
    ],
    [account({ accountId: "slalom", name: "Slalom 401k" })],
    ASOF
  );
  check("a row that is not income is excluded", Math.abs(dirty.total - 100) < 0.01);
  check("and the exclusion is reported rather than silent", dirty.excluded === 1);

  // ---- both surfaces must report, not estimate -----------------------------
  // The card has two controls: click to chat, hover for a report. Fixing only
  // the chat tool would leave the report button inventing yields beside a
  // measurement, which is worse than both being wrong the same way.
  const read = (rel: string) => readFileSync(join(__dirname, "..", rel), "utf8");
  const tool = read("src/lib/tools/get-dividend-income.ts");
  const report = read("src/app/api/report/analysis/route.ts");

  for (const [where, src] of [["the chat tool", tool], ["the report route", report]] as const) {
    check(
      `${where} carries no hardcoded yield table`,
      !/APPROXIMATE_YIELDS|DEFAULT_YIELDS/.test(src),
      "VTI: 1.3, VOO: 1.3, BND: 3.5 — guesses entered once and never revisited"
    );
  }
  check(
    "the report no longer asks the model to estimate annual income",
    !/Estimate annual income/.test(report),
    "the prompt that made the report button disagree with the chat beside it"
  );
  check(
    "it is handed the recorded figures instead",
    /\$\{ctx\.dividendText\}/.test(report)
  );
  check(
    "and told not to substitute typical yields",
    /do not substitute typical yields/.test(report)
  );
  check(
    "the report text names the accounts the total excludes",
    /ACCOUNTS THE TOTAL DOES NOT SPEAK FOR/.test(report)
  );
  check(
    "and states what share of value the total covers",
    /valueCovered \* 100/.test(report),
    "a total without its coverage reads as the whole portfolio"
  );

  console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILED`);
  return failures;
}

// 365 - 2, so the start lands two days inside the window: within the grace.
const WINDOW_MINUS_2 = 363;

process.exit(main() === 0 ? 0 : 1);
