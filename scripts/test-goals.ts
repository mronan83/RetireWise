/**
 * Goal progress, and the trophy handed to a household carrying $78,116.19 of
 * debt.
 *
 * Every goal's progress was `portfolioValue / targetAmount`, written nightly
 * into every row by the snapshot cron and clamped to 100% by the panel. So:
 *
 *   1. All three goals drew the same bar, from a number that described none
 *      of them.
 *   2. "Pay off all debt", target $31,200, read 312,798.75 / 31,200 = 1002%,
 *      clamped to 100%, and set is_completed = true.
 *   3. current_amount was never written at creation and never read by the
 *      panel — it existed only to be overwritten by the cron.
 *
 * The replacement measures a goal over the accounts linked to it and nothing
 * else. The assertions below are the ways that can go wrong.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  computeGoalProgress,
  shouldClose,
  validateBasis,
  type LinkBaseline,
  type LinkCurrent,
} from "../src/lib/goals/progress";

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${ok || !detail ? "" : ` — ${detail}`}`);
  if (!ok) failures++;
}

const link = (id: string, baseline: number): LinkBaseline => ({
  itemType: "debt",
  itemId: id,
  baselineAmount: baseline,
});
const now = (id: string, current: number | null): LinkCurrent => ({
  itemType: "debt",
  itemId: id,
  current,
});

/** The three cards carrying a balance, and the five sitting at zero. */
const CARDS = {
  visa: 6034.99,
  wells: 3361.57,
  platinum: 3265.63,
};
const DORMANT = ["hilton", "bonvoy", "amexGold", "deltaBlue", "deltaBiz"];
const BASIS = CARDS.visa + CARDS.wells + CARDS.platinum; // 12,662.19

function payoff(currents: Record<string, number | null>) {
  const links = [
    ...Object.entries(CARDS).map(([k, v]) => link(k, v)),
    ...DORMANT.map((d) => link(d, 0)),
  ];
  const all = [...Object.keys(CARDS), ...DORMANT];
  return computeGoalProgress({
    direction: "reduce",
    target: 0,
    links,
    currents: all.map((k) => now(k, k in currents ? currents[k] : (links.find((l) => l.itemId === k)!.baselineAmount as number))),
  });
}

function main() {
  // ---- the goal is its links, and nothing else ----------------------------
  const scoped = computeGoalProgress({
    direction: "reduce",
    target: 0,
    links: [link("visa", 6034.99)],
    currents: [now("visa", 6034.99), now("mortgage", 34254)],
  });
  check(
    "an unlinked debt is invisible to the goal",
    scoped.baseline === 6034.99 && scoped.current === 6034.99,
    "the mortgage is in the household, not in this goal"
  );
  check("and only linked items are counted", scoped.linkedCount === 1);

  // ---- the basis is struck once -------------------------------------------
  const start = payoff({});
  check("a fresh payoff goal starts at 0%", start.pct === 0, String(start.pct));
  check(
    "its basis is the sum of the balances at creation",
    Math.abs(start.baseline - 12662.19) < 0.001,
    start.baseline.toFixed(2)
  );
  check(
    "dormant cards add nothing to the basis",
    Math.abs(start.baseline - BASIS) < 0.001,
    "five cards at zero contribute zero to the denominator"
  );
  check("but they are still linked and watched", start.linkedCount === 8);

  // ---- a charge on a dormant card is real backwards movement --------------
  const charged = payoff({ hilton: 500 });
  check(
    "charging a card that started at zero moves the goal backwards",
    charged.pct !== null && charged.pct < 0,
    `${charged.pct?.toFixed(2)}%`
  );
  check(
    "and by the right amount",
    charged.pct !== null && Math.abs(charged.pct - (-500 / BASIS) * 100) < 0.001,
    `${charged.pct?.toFixed(2)}% on a basis of ${BASIS.toFixed(2)}`
  );
  check(
    "which the old code could not express at all",
    Math.max(0, Math.min(100, -3.95)) === 0,
    "clamped to the floor, so a month of borrowing read as standing still"
  );

  // ---- paying down ---------------------------------------------------------
  const paid = payoff({ visa: 4034.99 });
  check(
    "paying $2,000 off a card moves the goal forward",
    paid.pct !== null && Math.abs(paid.pct - (2000 / BASIS) * 100) < 0.001,
    `${paid.pct?.toFixed(2)}%`
  );
  const mixed = payoff({ visa: 4034.99, hilton: 800 });
  check(
    "paying $2,000 and charging $800 nets to $1,200 of progress",
    mixed.pct !== null && Math.abs(mixed.moved - 1200) < 0.001,
    mixed.moved.toFixed(2)
  );
  const underwater = payoff({ visa: 6534.99, hilton: 2000 });
  check(
    "borrowing more than you repay reads negative, not zero",
    underwater.moved < 0 && underwater.pct !== null && underwater.pct < 0,
    `${underwater.moved.toFixed(2)} / ${underwater.pct?.toFixed(2)}%`
  );

  // ---- the end state -------------------------------------------------------
  const cleared = payoff({ visa: 0, wells: 0, platinum: 0 });
  check("clearing every balance reaches exactly 100%", Math.abs(cleared.pct! - 100) < 0.001);
  check("and reports itself satisfied", cleared.satisfied);
  const clearedButCharged = payoff({ visa: 0, wells: 0, platinum: 0, deltaBlue: 800 });
  check(
    "but $800 on a dormant card leaves it short of 100%",
    Math.abs(clearedButCharged.pct! - ((BASIS - 800) / BASIS) * 100) < 0.001,
    `${clearedButCharged.pct?.toFixed(1)}%`
  );
  check("and not satisfied", !clearedButCharged.satisfied);

  // ---- overshoot is not clamped -------------------------------------------
  const over = computeGoalProgress({
    direction: "accumulate",
    target: 31200,
    links: [link("portfolio", 0)],
    currents: [now("portfolio", 312798.75)],
  });
  check(
    "a goal whose target is long passed reports 1002%, not 100%",
    over.pct !== null && Math.abs(over.pct - 1002.56) < 0.01,
    `${over.pct?.toFixed(2)}% — the clamp is what hid the misconfiguration`
  );

  // ---- a basis of zero has no percentage ----------------------------------
  const noBasis = computeGoalProgress({
    direction: "reduce",
    target: 0,
    links: DORMANT.map((d) => link(d, 0)),
    currents: DORMANT.map((d) => now(d, 0)),
  });
  check(
    "a goal linked only to zero balances yields no percentage",
    noBasis.pct === null,
    "0/0 is NaN and −500/0 is −Infinity; neither belongs on a progress bar"
  );
  check(
    "and it is null rather than 0, which would read as 'no progress yet'",
    noBasis.pct !== 0
  );
  check(
    "creating such a goal is refused outright",
    validateBasis({ direction: "reduce", target: 0, links: DORMANT.map((d) => link(d, 0)) }).ok === false
  );
  check(
    "a goal with no links at all is refused too",
    validateBasis({ direction: "reduce", target: 0, links: [] }).ok === false
  );
  check(
    "one card with a balance is enough to allow it",
    validateBasis({
      direction: "reduce",
      target: 0,
      links: [link("visa", 6034.99), ...DORMANT.map((d) => link(d, 0))],
    }).ok === true,
    "dormant cards are welcome — a goal of ONLY dormant cards is not"
  );

  // ---- a deleted account must not look like an achievement ----------------
  const orphaned = computeGoalProgress({
    direction: "reduce",
    target: 0,
    links: [link("visa", 6034.99), link("wells", 3361.57)],
    currents: [now("visa", 6034.99), now("wells", null)],
  });
  check(
    "a deleted account is dropped from both sides, not read as paid off",
    Math.abs(orphaned.baseline - 6034.99) < 0.001 && Math.abs(orphaned.current - 6034.99) < 0.001,
    "reading it as a balance of zero would report 35.7% progress for a deletion"
  );
  check("progress stays honest at 0%", Math.abs(orphaned.pct!) < 0.001);
  check("and the lost link is counted", orphaned.orphanedCount === 1);

  // ---- closure is latched, not derived ------------------------------------
  check("a satisfied goal that is still open should close", shouldClose(cleared, null));
  check("a goal already closed is not closed again", !shouldClose(cleared, new Date()));
  check("an unsatisfied goal does not close", !shouldClose(charged, null));
  check(
    "and a closed goal does NOT re-open when a card is charged",
    !shouldClose(clearedButCharged, new Date("2028-03-01")),
    "derived completion would flip back to false; new debt needs a new goal"
  );

  // ---- accumulate still works ---------------------------------------------
  const retire = computeGoalProgress({
    direction: "accumulate",
    target: 2500000,
    links: [link("acc", 0)],
    currents: [now("acc", 312798.75)],
  });
  check(
    "a retirement goal measured from zero reads as it did before",
    Math.abs(retire.pct! - 12.51) < 0.01,
    `${retire.pct?.toFixed(2)}% — 312,798.75 of 2,500,000`
  );

  // ---- the code that produced the trophy is gone --------------------------
  const read = (rel: string) => readFileSync(join(__dirname, "..", rel), "utf8");
  // The snapshot job's per-household work, which closes goals, lives here.
  const cron = read("src/lib/utils/portfolio-snapshot.ts");
  const panel = read("src/components/dashboard/goals-panel.tsx");

  check(
    "the cron no longer writes portfolio value into every goal",
    !/currentAmount:\s*String\(totalValue\)/.test(cron),
    "one line, and it told a household with $78k of debt that it was clear"
  );
  check(
    "nor sets completion from the portfolio total",
    !/isCompleted\s*=\s*totalValue\s*>=/.test(cron)
  );
  check(
    "the panel no longer divides the portfolio by each goal's target",
    !/portfolioValue\s*\/\s*target/.test(panel),
    "the reason all three goals drew the same bar"
  );
  check(
    "and no longer clamps the reported percentage",
    !/Math\.min\(100,\s*\(/.test(panel)
  );
  check(
    "closure is stored on the goal rather than recomputed",
    /closedAt/.test(cron) && /closed_at/.test(read("src/lib/db/schema.ts"))
  );

  console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILED`);
  return failures;
}

process.exit(main() === 0 ? 0 : 1);
