import { expect, test } from "@playwright/test";
import { enterDemoMode } from "./helpers";

/**
 * Goal progress, read off the rendered dashboard against a real database.
 *
 * The unit suite proves the arithmetic on hand-built inputs. It cannot prove
 * the query feeding it, and that is exactly where this broke: account values
 * were fetched with a correlated subquery in the select list which returned
 * NULL for every row, coalesced to 0. A retirement goal linked to six funded
 * accounts reported a current value of nothing and drew an empty bar, while
 * every unit test passed.
 *
 * Scoped to the goals panel on purpose. The dashboard is full of percentages —
 * account returns, allocation weights — and a check against the whole page
 * would have passed with the bug in place.
 */

type Row = {
  name: string;
  direction: string;
  linked: number;
  pct: number | null;
  current: number | null;
  baseline: number | null;
};

async function goalRows(page: import("@playwright/test").Page): Promise<Row[]> {
  const panel = page.getByTestId("goals-panel");
  await expect(panel, "the goals panel is not on the dashboard").toBeVisible();

  return panel.getByTestId("goal-row").evaluateAll((nodes) =>
    nodes.map((n) => {
      const el = n as HTMLElement;
      const numOrNull = (v: string | undefined) =>
        v === undefined || v === "" ? null : Number(v);
      return {
        name: el.dataset.goalName ?? "",
        direction: el.dataset.goalDirection ?? "",
        linked: Number(el.dataset.goalLinked ?? "0"),
        pct: numOrNull(el.dataset.goalPct),
        current: numOrNull(el.dataset.goalCurrent),
        baseline: numOrNull(el.dataset.goalBaseline),
      };
    })
  );
}

test.describe("goals", () => {
  test.beforeEach(async ({ page }) => {
    await enterDemoMode(page);
  });

  test("a goal linked to funded accounts reports their value", async ({ page }) => {
    const rows = await goalRows(page);
    const retirement = rows.find((r) => r.name === "Retire by 62");
    expect(retirement, `the seeded retirement goal is missing — got ${JSON.stringify(rows)}`).toBeDefined();

    expect(
      retirement!.linked,
      "the retirement goal should be linked to the demo household's accounts"
    ).toBeGreaterThan(0);

    // The bug, stated as the assertion: six funded accounts summing to zero.
    expect(
      retirement!.current,
      `the goal is linked to ${retirement!.linked} accounts but values them at ` +
        `${retirement!.current}. The demo household holds a funded portfolio, so the ` +
        `query behind this returned nothing.`
    ).toBeGreaterThan(0);

    expect(
      retirement!.pct,
      "an accumulate goal over a funded portfolio must report progress above zero"
    ).toBeGreaterThan(0);
  });

  test("each goal is measured over its own links, not the portfolio", async ({ page }) => {
    const rows = await goalRows(page);
    expect(rows.length, "the demo household seeds two goals").toBeGreaterThanOrEqual(2);

    const pcts = rows.map((r) => r.pct);
    expect(
      new Set(pcts).size,
      `every goal reports the same figure (${JSON.stringify(pcts)}) — which is what ` +
        `portfolioValue / target produced for all of them alike`
    ).toBeGreaterThan(1);
  });

  test("the payoff goal measures debt against its own basis", async ({ page }) => {
    const rows = await goalRows(page);
    const payoff = rows.find((r) => r.direction === "reduce");
    expect(payoff, `no payoff goal found — got ${JSON.stringify(rows)}`).toBeDefined();

    // Its basis is the seeded debt, not the portfolio. Reading the portfolio
    // here is what put it at 1002% and clamped it to a completed 100%.
    expect(payoff!.baseline, "the payoff basis should be the linked debts").toBeGreaterThan(0);
    expect(
      payoff!.baseline,
      `the payoff basis is ${payoff!.baseline}, which is portfolio-sized rather than debt-sized`
    ).toBeLessThan(100000);

    expect(
      payoff!.pct,
      "nothing has been paid on the seeded debts, so the goal sits at zero"
    ).toBeCloseTo(0, 4);
  });
});
