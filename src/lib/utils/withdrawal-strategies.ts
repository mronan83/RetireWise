import { calculateRMD } from "./financial-analytics";
import { projectedIncomeTax } from "./projection-scenarios";

/**
 * Which order to draw accounts in, compared four ways.
 *
 * This is the one calculation that is not the projection engine, because the
 * engine draws from every account in proportion and this asks what happens if
 * you do not. Whether to rebuild it on the engine, or to stop claiming the
 * app optimises withdrawal order, is the owner's open question (Q10 in
 * docs/REQUIREMENTS.md).
 *
 * Until then it uses the engine's rules: today's tax table and the Social
 * Security worksheet (projectedIncomeTax), the IRS RMD table, and figures in
 * today's dollars with a return net of inflation, so no bracket has to be
 * guessed forward. It used to tax with 2024 brackets, count 85% of Social
 * Security as taxable for everyone, and use an RMD divisor of its own.
 */

export type WithdrawalStrategy = {
  name: string;
  description: string;
  yearByYear: {
    age: number;
    taxDeferred: number;
    taxFree: number;
    taxable: number;
    totalWithdrawal: number;
    taxEstimate: number;
    afterTaxIncome: number;
  }[];
  totalTaxesPaid: number;
  portfolioAtEnd: number;
};

type Bucket = "taxable" | "taxDeferred" | "taxFree";

export function calculateWithdrawalStrategies(params: {
  /** Balances at the start of retirement, in today's dollars. */
  taxDeferredBalance: number;
  taxFreeBalance: number;
  taxableBalance: number;
  /** Today's dollars. */
  annualExpenses: number;
  annualSSIncome: number;
  yearsInRetirement: number;
  /** Return net of inflation, as a fraction. */
  realReturnRate: number;
  startAge: number;
}): WithdrawalStrategy[] {
  const { annualExpenses, annualSSIncome, yearsInRetirement, realReturnRate, startAge } = params;
  const annualNeed = Math.max(0, annualExpenses - annualSSIncome);

  function simulate(order: Bucket[], name: string, description: string): WithdrawalStrategy {
    const bal: Record<Bucket, number> = {
      taxDeferred: params.taxDeferredBalance,
      taxFree: params.taxFreeBalance,
      taxable: params.taxableBalance,
    };
    let totalTaxes = 0;
    const years: WithdrawalStrategy["yearByYear"] = [];

    for (let y = 0; y < yearsInRetirement; y++) {
      for (const b of Object.keys(bal) as Bucket[]) bal[b] *= 1 + realReturnRate;
      const age = startAge + y;
      const drawn: Record<Bucket, number> = { taxDeferred: 0, taxFree: 0, taxable: 0 };

      // The RMD comes out first, whatever the order.
      const rmd = Math.min(calculateRMD(bal.taxDeferred, age), bal.taxDeferred);
      drawn.taxDeferred += rmd;
      bal.taxDeferred -= rmd;

      // Then the rest of the need, and the tax on what is drawn, in order. Tax
      // depends on how much tax-deferred money is drawn, so settle it by
      // repeating until the draw stops changing.
      let tax = projectedIncomeTax(drawn.taxDeferred, annualSSIncome, 1);
      for (let i = 0; i < 50; i++) {
        let remaining = annualNeed + tax - (drawn.taxDeferred + drawn.taxFree + drawn.taxable);
        if (remaining <= 0.5) break;
        for (const b of order) {
          if (remaining <= 0) break;
          const w = Math.min(remaining, bal[b]);
          drawn[b] += w;
          bal[b] -= w;
          remaining -= w;
        }
        const next = projectedIncomeTax(drawn.taxDeferred, annualSSIncome, 1);
        if (Math.abs(next - tax) < 0.5 || remaining > 0) {
          tax = next;
          break;
        }
        tax = next;
      }
      totalTaxes += tax;

      const total = drawn.taxDeferred + drawn.taxFree + drawn.taxable;
      // A required distribution beyond the need and its tax is reinvested.
      const surplus = total - tax - annualNeed;
      if (surplus > 0) bal.taxable += surplus;

      years.push({
        age,
        taxDeferred: Math.round(drawn.taxDeferred),
        taxFree: Math.round(drawn.taxFree),
        taxable: Math.round(drawn.taxable),
        totalWithdrawal: Math.round(total),
        taxEstimate: Math.round(tax),
        afterTaxIncome: Math.round(Math.min(total - tax, annualNeed) + annualSSIncome),
      });
    }

    return {
      name,
      description,
      yearByYear: years,
      totalTaxesPaid: Math.round(totalTaxes),
      portfolioAtEnd: Math.round(bal.taxDeferred + bal.taxFree + bal.taxable),
    };
  }

  return [
    simulate(
      ["taxable", "taxDeferred", "taxFree"],
      "Conventional",
      "Draw taxable first, then tax-deferred (401k/IRA), then Roth last. Lets Roth grow tax-free longest."
    ),
    simulate(
      ["taxDeferred", "taxable", "taxFree"],
      "Tax-Deferred First",
      "Draw 401k/IRA first to reduce future RMDs, then taxable, then Roth. Can reduce lifetime RMD burden."
    ),
    simulate(
      ["taxFree", "taxable", "taxDeferred"],
      "Roth First",
      "Use Roth first for tax-free income, then taxable, then tax-deferred. Keeps taxable income low early."
    ),
    simulate(
      ["taxable", "taxFree", "taxDeferred"],
      "Taxable, then Roth",
      "Draw taxable, then Roth, then tax-deferred last. Keeps taxable income low until RMDs begin."
    ),
  ];
}
