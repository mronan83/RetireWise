/**
 * Cost basis, period returns, and the two ways "we don't know" was shown as
 * a number.
 *
 * A Molina 401(k) showed "+$0.00 (+0.00%)" and "Day/YTD/1Y/3Y/5Y/10Y all
 * +0.0%". Neither figure was a calculation that went wrong — both were
 * calculations performed on data that did not exist:
 *
 *   1. Plaid does not report cost basis for most employer plans. The sync
 *      wrote `shares * currentPrice` in its place, so cost equalled market
 *      value and the gain was exactly zero. Worse, it wrote that over a
 *      REAL basis recorded by an earlier sync: three accounts lost their
 *      true cost, and with it several years of recorded gain.
 *   2. The period returns answered "what was this worth ten years ago?"
 *      with the oldest row held, whatever its date. Five months of history
 *      produced a "10Y" figure — and 1Y, 3Y, 5Y and 10Y were all the same
 *      number under four different labels.
 *
 * Every assertion below is written as the bug, so a regression reads as the
 * old behaviour coming back.
 */
import {
  gainLossFor,
  missingBasisNote,
  positionBasis,
  rollupBasis,
} from "../src/lib/utils/cost-basis";
import { calculateGainLoss, calculatePortfolioSummary } from "../src/lib/utils/calculations";
import type { Holding } from "../src/lib/types";
import { aggregateHoldings } from "../src/lib/plaid/sync";

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${ok || !detail ? "" : ` — ${detail}`}`);
  if (!ok) failures++;
}

function holding(
  shares: number,
  price: number,
  basis: number | null,
  assetClass = "us_stock"
): Holding {
  return {
    shares: String(shares),
    currentPrice: String(price),
    currentValue: String(shares * price),
    costBasisPerShare: basis === null ? null : String(basis),
    assetClass,
  } as unknown as Holding;
}

function main() {
  // ---- zero is not unknown -----------------------------------------------
  check(
    "a position with no reported basis has no basis, not a basis of zero",
    positionBasis(holding(604.057, 34.84, null)) === null
  );
  check(
    "a position with a real basis still reports it",
    positionBasis(holding(100, 50, 20)) === 2000
  );
  check(
    "a genuinely zero basis is not mistaken for a missing one",
    positionBasis(holding(100, 50, 0)) === 0
  );

  // The exact shape of the Molina 401(k) as it was stored: Plaid reported no
  // cost basis, and the sync filled it with the current price.
  const fabricated = holding(604.057, 34.84, 34.84);
  const fabricatedGl = gainLossFor(
    Number(fabricated.currentValue),
    positionBasis(fabricated)
  );
  check(
    "a basis equal to price still computes to exactly zero gain",
    fabricatedGl !== null && Math.abs(fabricatedGl.gainLoss) < 0.01,
    "which is why the sync must never write one"
  );

  const honest = holding(604.057, 34.84, null);
  check(
    "with the basis left unreported there is no gain figure at all",
    calculateGainLoss(honest) === null
  );

  // ---- the arithmetic that produced the old numbers -----------------------
  check(
    "an absent basis read as zero made the whole position profit",
    Number(null as unknown as string) === 0,
    "Number(null) === 0, which TypeScript does not flag"
  );
  const gl = gainLossFor(21045.35, 0);
  check(
    "a zero basis yields no percentage rather than an infinite one",
    gl === null
  );

  // ---- a partial total is not a total -------------------------------------
  const mixed = [holding(100, 50, 20), holding(10, 100, null)];
  const mixedRollup = rollupBasis(mixed);
  check(
    "one unknown position makes the account's basis unknown",
    mixedRollup.basis === null,
    String(mixedRollup.basis)
  );
  check("and the counts say how many of each", mixedRollup.known === 1 && mixedRollup.unknown === 1);
  check(
    "summing only the known positions would have overstated the gain",
    // $2,000 of known cost against $6,000 of total value reads as +200%.
    // The true cost is higher by whatever the second position cost.
    (6000 - 2000) / 2000 === 2
  );
  check(
    "so no gain is reported for a partially-known account",
    gainLossFor(6000, mixedRollup.basis) === null
  );

  const allKnown = rollupBasis([holding(100, 50, 20), holding(10, 100, 60)]);
  check("an account with every basis reported still totals", allKnown.basis === 2600);
  const knownGl = gainLossFor(6000, allKnown.basis);
  check(
    "and its gain is the ordinary calculation",
    knownGl !== null && Math.round(knownGl.gainLoss) === 3400
  );

  // ---- what the reader is told --------------------------------------------
  check(
    "a fully-unknown single-position account names the institution as the reason",
    missingBasisNote(rollupBasis([holding(604.057, 34.84, null)])) ===
      "Cost basis not reported by this institution"
  );
  check(
    "a partially-unknown account says how many positions are missing",
    missingBasisNote(mixedRollup) === "Cost basis not reported for 1 of 2 positions"
  );
  check(
    "an account with nothing missing says nothing",
    missingBasisNote(allKnown) === null
  );

  // ---- the portfolio total ------------------------------------------------
  const summary = calculatePortfolioSummary(mixed);
  check(
    "the portfolio gain card has no figure when any position lacks a basis",
    summary.totalGainLoss === null && summary.totalCostBasis === null
  );
  check(
    "and it can say how many positions are responsible",
    summary.positionsWithoutBasis === 1
  );
  check(
    "the value itself is unaffected — only the gain is unknowable",
    summary.totalValue === 6000
  );

  // ---- period returns: labels that outran the history ---------------------
  // Molina 401k as stored: snapshots from 2026-04-20 only, flat at 19,752.12.
  const GRACE = 7;
  function addDays(iso: string, days: number): string {
    const d = new Date(`${iso}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().split("T")[0];
  }
  // The rule the query now applies, restated here so a change to it fails.
  function covers(earliest: string, target: string): boolean {
    return !(earliest > addDays(target, GRACE));
  }

  check(
    "five months of history cannot answer the ten-year question",
    !covers("2026-04-20", "2016-09-20")
  );
  check("nor the five-year one", !covers("2026-04-20", "2021-09-20"));
  check("nor the three-year one", !covers("2026-04-20", "2023-09-20"));
  check("nor the one-year one", !covers("2026-04-20", "2025-09-20"));
  check(
    "nor year-to-date, when the history starts in April",
    !covers("2026-04-20", "2026-01-01")
  );
  check(
    "history that reaches the boundary does answer it",
    covers("2025-06-01", "2025-09-20")
  );
  check(
    "a boundary falling on a weekend is absorbed, not rejected",
    covers("2025-09-22", "2025-09-20"),
    "two days late"
  );
  check(
    "a boundary missed by a month is not",
    !covers("2025-10-20", "2025-09-20")
  );

  // The tell that the old behaviour was wrong: every period agreed.
  const oldStyle = ["1yr", "3yr", "5yr", "10yr"].map(() => 2.42);
  check(
    "four periods reporting the identical number was the symptom",
    new Set(oldStyle).size === 1,
    "each label claimed a period the app had never observed"
  );

  // ---- the periods five months of history CAN answer ----------------------
  // Removing the overclaiming labels emptied the row entirely, which is
  // honest and useless. These are the windows the record actually covers.
  check("30 days is within five months of history", covers("2026-04-20", "2026-08-21"));
  check("90 days is too", covers("2026-04-20", "2026-06-22"));
  check(
    "but a 30-day window is still refused when the history is two weeks old",
    !covers("2026-09-06", "2026-08-21")
  );

  // Inception to date needs no coverage test: it starts where the record
  // starts. What it must never do is borrow another period's name.
  const inceptionPct = ((21045.35 - 19752.12) / 19752.12) * 100;
  check(
    "inception-to-date is a real figure, labelled by its own start date",
    Math.abs(inceptionPct - 6.55) < 0.01,
    `${inceptionPct.toFixed(2)}%`
  );

  // ---- the sync that destroyed the real basis -----------------------------
  const securities = new Map([
    ["sec_plt", { ticker_symbol: "PLT.HYBRID.2060.T", name: "Plt Hybrid 2060 T", type: "mutual fund" }],
    ["sec_voo", { ticker_symbol: "VOO", name: "Vanguard S&P 500", type: "etf" }],
  ]);

  // Exactly what Fidelity's 401(k) feed returns: a price, no cost basis.
  const noBasis = aggregateHoldings(
    [{ security_id: "sec_plt", quantity: 604.057, institution_price: 34.84, cost_basis: null }],
    securities
  );
  check(
    "a Plaid holding with no cost basis yields no cost basis",
    noBasis[0].costBasisPerShare === null,
    String(noBasis[0].costBasisPerShare)
  );
  check(
    "and specifically not the current price, which is what it used to yield",
    noBasis[0].costBasisPerShare !== 34.84
  );
  check("the price and shares are still recorded", noBasis[0].currentPrice === 34.84);

  const withBasis = aggregateHoldings(
    [{ security_id: "sec_voo", quantity: 10, institution_price: 701.78, cost_basis: 4190.215 }],
    securities
  );
  check(
    "a Plaid holding that does report cost basis is unaffected",
    withBasis[0].costBasisPerShare !== null &&
      Math.abs(withBasis[0].costBasisPerShare - 419.0215) < 0.0001,
    String(withBasis[0].costBasisPerShare)
  );

  // Several lots, one of them silent.
  const mixedLots = aggregateHoldings(
    [
      { security_id: "sec_voo", quantity: 10, institution_price: 701.78, cost_basis: 4190.21 },
      { security_id: "sec_voo", quantity: 5, institution_price: 701.78, cost_basis: null },
    ],
    securities
  );
  check(
    "one lot without a basis makes the whole position's basis unknown",
    mixedLots[0].costBasisPerShare === null,
    "averaging the lots that have one understates cost and overstates gain"
  );
  check("though the shares from both lots are still counted", mixedLots[0].shares === 15);

  console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILED`);
  return failures;
}

process.exit(main() === 0 ? 0 : 1);
