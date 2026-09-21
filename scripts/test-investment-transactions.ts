/**
 * Investment transactions, and the cost basis they can and cannot prove.
 *
 * Deriving a basis from transactions is only safe when the record shows it
 * covers the position's whole life. Plaid returns at most two years before
 * the Item was linked, so a 401(k) accumulating payroll deferrals since
 * before then has lots that are simply not in the data — and a basis built
 * from the visible half is too low, which makes the gain too high, and it
 * looks entirely reasonable while being wrong by thousands.
 *
 * So derivation is gated on two checkable conditions, and every assertion
 * here is a way the gate could wrongly open.
 */
import {
  deriveCostBasis,
  isFeePseudoSecurity,
  mapTransactionType,
  matchTransactionsToPositions,
  resolveTransactionSecurity,
  type LocalTransactionType,
  type PlaidSecurityLike,
} from "../src/lib/plaid/investment-transactions";

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${ok || !detail ? "" : ` — ${detail}`}`);
  if (!ok) failures++;
}

type T = { type: LocalTransactionType; shares: number | null; amount: number; date: string };
const buy = (date: string, shares: number, amount: number): T => ({ type: "buy", shares, amount, date });

function main() {
  // ---- type mapping -------------------------------------------------------
  // Plaid's `cash` says money moved without saying what it was. A payroll
  // contribution, a dividend and a withdrawal are three different things to
  // a retirement plan, and the subtype is what separates them.
  check("a buy is a buy", mapTransactionType("buy", "buy") === "buy");
  check("a sell is a sell", mapTransactionType("sell", "sell") === "sell");
  check(
    "a payroll contribution is not a generic cash movement",
    mapTransactionType("cash", "contribution") === "contribution"
  );
  check(
    "a dividend reinvestment is a dividend, not a buy",
    mapTransactionType("buy", "dividend reinvestment") === "dividend"
  );
  check(
    "a qualified dividend too",
    mapTransactionType("cash", "qualified dividend") === "dividend"
  );
  check(
    "a long-term capital gain distribution is income, not a purchase",
    mapTransactionType("cash", "long-term capital gain") === "dividend"
  );
  check("a management fee is a fee", mapTransactionType("fee", "management fee") === "fee");
  check("a fund fee too", mapTransactionType("cash", "fund fee") === "fee");
  check("a distribution is a withdrawal", mapTransactionType("cash", "distribution") === "withdrawal");
  check("a transfer is a transfer", mapTransactionType("transfer", "transfer") === "transfer");
  check("a split is a split", mapTransactionType("cash", "split") === "split");
  check(
    "a cancellation is skipped rather than forced into a category",
    mapTransactionType("cancel", "buy") === null
  );
  check(
    "and so is a cash row whose subtype says nothing usable",
    mapTransactionType("cash", "adjustment") === null
  );

  // ---- derivation: the case that works ------------------------------------
  const clean = [buy("2025-01-10", 10, 1000), buy("2025-06-10", 10, 1400)];
  const ok = deriveCostBasis(clean, 20);
  check("a fully-visible position derives", ok.ok, ok.ok ? "" : ok.reason);
  check(
    "at the true average cost, not the latest price",
    ok.ok && Math.abs(ok.costBasisPerShare - 120) < 1e-9,
    ok.ok ? String(ok.costBasisPerShare) : ""
  );
  check("and reports the total it summed", ok.ok && ok.totalCost === 2400);

  // Reinvested dividends are acquisitions and belong in the cost.
  const withReinvestment: T[] = [
    buy("2025-01-10", 10, 1000),
    { type: "dividend", shares: 1, amount: 110, date: "2025-04-01" },
  ];
  const wr = deriveCostBasis(withReinvestment, 11);
  check(
    "a reinvested dividend counts toward cost, being shares bought",
    wr.ok && Math.abs(wr.costBasisPerShare - 1110 / 11) < 1e-9,
    wr.ok ? wr.costBasisPerShare.toFixed(4) : wr.reason
  );

  // ---- derivation: every case that must be refused ------------------------
  // This is Slalom: years of payroll deferrals, only the last two visible.
  const partial = deriveCostBasis([buy("2025-01-10", 10, 1000)], 604.057);
  check("a position with shares acquired before the window is refused", !partial.ok);
  check(
    "and the refusal says which count disagreed",
    !partial.ok && /acquired .* but .* are held/.test(partial.reason),
    partial.ok ? "" : partial.reason
  );

  const sold = deriveCostBasis(
    [buy("2025-01-10", 20, 2000), { type: "sell", shares: 5, amount: 700, date: "2025-08-01" }],
    15
  );
  check(
    "a sale is refused, because which lots went depends on the broker's method",
    !sold.ok
  );
  check(
    "and the refusal names the disposal date",
    !sold.ok && sold.reason.includes("2025-08-01"),
    sold.ok ? "" : sold.reason
  );

  const transferred = deriveCostBasis(
    [{ type: "transfer", shares: 100, amount: 0, date: "2025-02-01" }, buy("2025-03-01", 10, 1100)],
    110
  );
  check(
    "a transfer in is refused: its basis was set before this window",
    !transferred.ok,
    transferred.ok ? "" : transferred.reason
  );

  const split = deriveCostBasis(
    [buy("2025-01-10", 10, 1000), { type: "split", shares: 10, amount: 0, date: "2025-05-01" }],
    20
  );
  check("a split is refused, having rebased the per-share cost", !split.ok);

  check("no transactions at all is refused", !deriveCostBasis([], 100).ok);
  check(
    "transactions with no share-acquiring rows are refused",
    !deriveCostBasis([{ type: "fee", shares: null, amount: 12, date: "2025-01-01" }], 100).ok
  );
  const noCost = deriveCostBasis([{ type: "buy", shares: 10, amount: 0, date: "2025-01-01" }], 10);
  check("acquisitions with no cost amount are refused", !noCost.ok);

  // ---- the arithmetic must not be fooled ---------------------------------
  // Plaid signs a buy as money leaving the account; the magnitude is the
  // cost whichever way the sign runs.
  const negative = deriveCostBasis(
    [
      { type: "buy", shares: 10, amount: -1000, date: "2025-01-10" },
      { type: "buy", shares: 10, amount: -1400, date: "2025-06-10" },
    ],
    20
  );
  check(
    "a negative amount is still a cost of that size",
    negative.ok && Math.abs(negative.costBasisPerShare - 120) < 1e-9,
    negative.ok ? String(negative.costBasisPerShare) : negative.reason
  );

  // Fractional shares must reconcile within tolerance, not exactly.
  const fractional = deriveCostBasis(
    [buy("2025-01-10", 604.0569999, 18392.61)],
    604.057
  );
  check(
    "a rounding difference in fractional shares does not block derivation",
    fractional.ok,
    fractional.ok ? "" : fractional.reason
  );

  // But a real shortfall must, however small it looks next to the total.
  const shortfall = deriveCostBasis([buy("2025-01-10", 600, 18000)], 604.057);
  check(
    "four missing shares is a shortfall, not a rounding difference",
    !shortfall.ok,
    shortfall.ok ? "" : shortfall.reason
  );

  // ---- what the old code would have produced ------------------------------
  // The point of the gate, stated as the number it prevents.
  const visibleOnly = 1000;
  const heldShares = 604.057;
  const marketValue = 21045.35;
  const wrongBasis = visibleOnly;
  check(
    "deriving from a partial window would have claimed a ~2000% gain",
    (marketValue - wrongBasis) / wrongBasis > 19,
    `${(((marketValue - wrongBasis) / wrongBasis) * 100).toFixed(0)}%`
  );
  check(
    "which is why the share count has to reconcile first",
    !deriveCostBasis([buy("2025-01-10", 10, visibleOnly)], heldShares).ok
  );

  // ---- matching a position to its transactions ----------------------------
  /**
   * The join, which is where the Schwab 401(k) actually failed.
   *
   * Every refusal above is a property of deriveCostBasis, and deriveCostBasis
   * only ever saw what the join handed it. The join handed it nothing:
   * matched on a ticker string derived per endpoint, eight of thirteen
   * positions found none of the account's 727 transactions and were reported
   * as "no transactions in the window" — for a window full of them. A
   * refusal is only honest when the input was complete.
   */
  type P = { id: string; accountId: string; ticker: string | null; plaidSecurityId: string | null };
  type Tx = { accountId: string; ticker: string | null; plaidSecurityId: string | null; label: string };

  const eupacHolding: P = {
    id: "h_eupac",
    accountId: "acct",
    ticker: "GG.EUPAC.TRUST.R1",
    plaidSecurityId: "sec_eupac",
  };
  const eupacTxn: Tx = {
    accountId: "acct",
    ticker: "RERGX",
    plaidSecurityId: "sec_eupac",
    label: "eupac",
  };

  const joined = matchTransactionsToPositions([eupacHolding], [eupacTxn]);
  check(
    "the same fund spelled two ways still joins on the security id",
    (joined.get("h_eupac") ?? []).length === 1,
    "GG.EUPAC.TRUST.R1 (holding) vs RERGX (transaction)"
  );

  // The other three from the same account, to prove it is not one lucky pair.
  const plan: P[] = [
    eupacHolding,
    { id: "h_intl", accountId: "acct", ticker: "VG.IS.TL.INTL.STK.MK", plaidSecurityId: "sec_intl" },
    { id: "h_val", accountId: "acct", ticker: "PUTN.LARGE.CP.VAL.R1", plaidSecurityId: "sec_val" },
    { id: "h_growth", accountId: "acct", ticker: "WT.CIF.II.GROWTH.2", plaidSecurityId: "sec_growth" },
  ];
  const planTxns: Tx[] = [
    eupacTxn,
    { accountId: "acct", ticker: "VTSNX", plaidSecurityId: "sec_intl", label: "intl" },
    { accountId: "acct", ticker: "GEPABX", plaidSecurityId: "sec_val", label: "val" },
    { accountId: "acct", ticker: "WTLRNX", plaidSecurityId: "sec_growth", label: "growth" },
  ];
  const planJoin = matchTransactionsToPositions(plan, planTxns);
  check(
    "every position in the plan finds its transactions, none of them by ticker",
    plan.every((p) => (planJoin.get(p.id) ?? []).length === 1),
    plan.map((p) => `${p.id}:${(planJoin.get(p.id) ?? []).length}`).join(" ")
  );

  // The bug this replaces, stated as what the old key would have returned.
  check(
    "matching on the ticker text alone would have found nothing",
    plan.every((p) => !planTxns.some((t) => t.ticker === p.ticker))
  );

  // A transaction whose security Plaid never described still carries the id.
  const undescribed = matchTransactionsToPositions(
    [eupacHolding],
    [{ accountId: "acct", ticker: null, plaidSecurityId: "sec_eupac", label: "no ticker" }]
  );
  check(
    "a transaction with no ticker at all still joins on its security id",
    (undescribed.get("h_eupac") ?? []).length === 1,
    "97 of 727 rows arrived this way"
  );

  // Two positions must not share each other's rows.
  const crossed = matchTransactionsToPositions(plan, planTxns);
  check(
    "a position gets its own transactions and no one else's",
    (crossed.get("h_intl") ?? [])[0]?.label === "intl"
  );

  // Accounts are part of the key: the same fund in two accounts is two
  // positions, and Plaid's security ids are per-Item, not per-account.
  const sameSecurityTwoAccounts = matchTransactionsToPositions(
    [
      { id: "h_a", accountId: "acct_a", ticker: "VTI", plaidSecurityId: "sec_vti" },
      { id: "h_b", accountId: "acct_b", ticker: "VTI", plaidSecurityId: "sec_vti" },
    ],
    [{ accountId: "acct_a", ticker: "VTI", plaidSecurityId: "sec_vti", label: "a" }]
  );
  check(
    "a transaction does not leak into the same fund held in another account",
    (sameSecurityTwoAccounts.get("h_a") ?? []).length === 1 &&
      (sameSecurityTwoAccounts.get("h_b") ?? []).length === 0
  );

  // Rows a person typed have no Plaid identity, and ticker is all there is.
  const manual = matchTransactionsToPositions(
    [{ id: "h_m", accountId: "acct", ticker: "VTI", plaidSecurityId: "sec_vti" }],
    [
      { accountId: "acct", ticker: "VTI", plaidSecurityId: null, label: "typed" },
      { accountId: "acct", ticker: "VTI", plaidSecurityId: "sec_vti", label: "plaid" },
    ]
  );
  check(
    "a hand-entered row joins on ticker alongside the Plaid rows",
    (manual.get("h_m") ?? []).length === 2,
    (manual.get("h_m") ?? []).map((t) => t.label).join(",")
  );

  // Nothing was backfilled, so rows stored before the id column must keep
  // matching exactly as they did until a sync rewrites them.
  const legacy = matchTransactionsToPositions(
    [{ id: "h_l", accountId: "acct", ticker: "VOO", plaidSecurityId: "sec_voo" }],
    [{ accountId: "acct", ticker: "VOO", plaidSecurityId: null, label: "pre-migration" }]
  );
  check(
    "a row stored before the security id existed still matches on ticker",
    (legacy.get("h_l") ?? []).length === 1
  );

  // And a manual holding — no Plaid identity of its own — still matches the
  // Plaid rows for the ticker it was typed under.
  const manualHolding = matchTransactionsToPositions(
    [{ id: "h_typed", accountId: "acct", ticker: "VOO", plaidSecurityId: null }],
    [{ accountId: "acct", ticker: "VOO", plaidSecurityId: "sec_voo", label: "plaid" }]
  );
  check(
    "a hand-entered position still finds Plaid's rows for its ticker",
    (manualHolding.get("h_typed") ?? []).length === 1
  );

  // The reason this matters, end to end: with the join fixed, the refusal is
  // the true one — the share counts disagree — not "there were no rows".
  const joinedRows = matchTransactionsToPositions([eupacHolding], [eupacTxn]);
  const honest = deriveCostBasis(
    (joinedRows.get("h_eupac") ?? []).map(() => buy("2025-01-10", 10, 1000)),
    604.057
  );
  check(
    "a joined position that predates the window is refused for that reason",
    !honest.ok && /acquired .* but .* are held/.test(honest.reason),
    honest.ok ? "" : honest.reason
  );
  const unjoined = deriveCostBasis([], 604.057);
  check(
    "which is not the reason it used to give",
    !unjoined.ok && unjoined.reason === "no transactions in the window"
  );

  // ---- fee pseudo-securities ----------------------------------------------
  // Plaid invents a security per fee, named after the fund it was charged
  // against. Nothing holds it, so a row filed under it is a position row
  // belonging to no position — and the fund it names has a position of its
  // own, which it must not be confused with.
  const securities = new Map<string, PlaidSecurityLike>([
    ["sec_intl", { ticker_symbol: null, cusip: null, name: "VANG INST TOTL SK TR" }],
    ["sec_intl_fee", { ticker_symbol: null, cusip: null, name: "VANG INST TOTL SK TR - fees" }],
    ["sec_vti", { ticker_symbol: "VTI", cusip: "922908769", name: "Vanguard Total Stock Market ETF" }],
  ]);

  check(
    "a fee pseudo-security is recognised",
    isFeePseudoSecurity(securities.get("sec_intl_fee"))
  );
  check(
    "the fund it is named after is not",
    !isFeePseudoSecurity(securities.get("sec_intl"))
  );
  check(
    "and neither is a real security that merely mentions fees",
    !isFeePseudoSecurity({ ticker_symbol: "BLK", cusip: null, name: "BlackRock Low Fees Fund" })
  );

  const feeRow = resolveTransactionSecurity("sec_intl_fee", securities);
  check(
    "a fee row is stored with no position identity at all",
    feeRow.ticker === null && feeRow.plaidSecurityId === null
  );
  const feeJoin = matchTransactionsToPositions(
    [{ id: "h_intl", accountId: "acct", ticker: "VG.IS.TL.INTL.STK.MK", plaidSecurityId: "sec_intl" }],
    [{ accountId: "acct", ...feeRow, label: "fee" }]
  );
  check(
    "so it cannot attach itself to the position it is named after",
    (feeJoin.get("h_intl") ?? []).length === 0
  );

  // ---- securities accumulate across pages ---------------------------------
  // Plaid describes a security in whichever page first mentions it. Mapping a
  // page as it arrives leaves a row referencing a security described later
  // with no ticker, for no reason but fetch order.
  const pages: { securities: [string, PlaidSecurityLike][] }[] = [
    { securities: [["sec_vti", { ticker_symbol: "VTI", cusip: null, name: "Vanguard Total Stock Market ETF" }]] },
    { securities: [] },
    { securities: [["sec_eupac", { ticker_symbol: "RERGX", cusip: null, name: "American Funds EuroPacific Growth R6" }]] },
  ];
  const accumulated = new Map<string, PlaidSecurityLike>();
  for (const page of pages) for (const [id, sec] of page.securities) accumulated.set(id, sec);

  // The row is on page 1; its security is described on page 3.
  const late = resolveTransactionSecurity("sec_eupac", accumulated);
  check(
    "a security described on a later page still resolves for an earlier row",
    late.ticker === "RERGX" && late.plaidSecurityId === "sec_eupac"
  );
  check(
    "and an id no page described keeps its id, which is what the join needs",
    resolveTransactionSecurity("sec_unknown", accumulated).plaidSecurityId === "sec_unknown"
  );
  check(
    "ticker falls back to CUSIP, then name, as the holdings side does",
    resolveTransactionSecurity("sec_cusip", new Map([["sec_cusip", { cusip: "922908769", name: "Some Fund" }]])).ticker === "922908769" &&
      resolveTransactionSecurity("sec_name", new Map([["sec_name", { name: "Collective Trust B" }]])).ticker === "Collective Trust B"
  );

  console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILED`);
  return failures;
}

process.exit(main() === 0 ? 0 : 1);
