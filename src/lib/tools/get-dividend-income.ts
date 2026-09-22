import { tool } from "ai";
import { z } from "zod";
import { getApiUserId } from "@/lib/auth-helpers";
import { getDividendRecord } from "../queries/dividends";
import { summarizeDividends, WINDOW_DAYS } from "../utils/dividends";

const round = (n: number) => Math.round(n * 100) / 100;

/**
 * What the portfolio actually paid over the trailing year.
 *
 * This used to multiply current value by a hardcoded yield table — a fixed
 * 1.3% for VTI, 3.5% for BND, and a per-asset-class default for every ticker
 * the table had never heard of, which is most of an employer plan. It always
 * produced a number, so a household whose custodians report no distributions
 * at all still received a confident annual income figure.
 *
 * There is now a real record: 182 distributions over two years. Where it
 * covers a year, this reports what was paid. Where it does not, it says so
 * and reports nothing for that account, because an estimate presented beside
 * measurements is indistinguishable from one.
 */
export const getDividendIncomeTool = tool({
  description:
    "Report the household's actual dividend and distribution income over the trailing 12 months, from recorded transactions. Shows per-account and per-payer totals, the split between reinvested and cash distributions, the trailing yield on current value, and — explicitly — which accounts the figure does not cover and why. Does not estimate: an account whose transaction history is too short, or whose custodian reports no distributions, is named as a gap rather than assigned a yield.",
  inputSchema: z.object({
    windowDays: z
      .number()
      .optional()
      .describe(
        `Trailing window in days. Default ${WINDOW_DAYS}. Only change this if the user asks for a period other than the last year.`
      ),
  }),
  execute: async ({ windowDays = WINDOW_DAYS }) => {
    // Holdings are keyed by the household id, not the signed-in account's own
    // id; the raw id reads back an empty portfolio instead of an error.
    const userId = await getApiUserId();
    if (!userId) return { error: "Not authenticated" };

    const asOf = new Date().toISOString().split("T")[0];
    const { rows, accounts } = await getDividendRecord(userId, asOf);

    if (accounts.length === 0) {
      return { error: "No accounts found for this household." };
    }

    const s = summarizeDividends(rows, accounts, asOf, windowDays);

    const reporting = s.accounts.filter((a) => a.status === "reported");
    const coveredPct = round(s.valueCovered * 100);

    return {
      window: { from: s.windowFrom, to: s.asOf, days: windowDays },

      // The headline, and immediately beside it what it speaks for. A total
      // covering 61% of the portfolio is not the household's income, and the
      // two numbers must not be separable.
      totalDistributions: round(s.total),
      monthlyAverage: round(s.monthly),
      // Real distributions from accounts whose record is shorter than the
      // window. Not part of the annual total, not thrown away either.
      alsoObservedButNotAFullYear: round(s.observedOutsideWindow),
      coversPercentOfPortfolio: coveredPct,
      coversAccounts: `${reporting.length} of ${s.accounts.length}`,

      // 80% of this household's distributions bought more shares rather than
      // settling as spendable cash. Reporting only the total invites the
      // conclusion that it is income available to live on.
      reinvested: round(s.reinvested),
      paidAsCash: round(s.cash),

      selfDistributions: round(s.self),
      spouseDistributions: round(s.spouse),

      trailingYieldOnCoveredValue:
        s.valueCovered > 0 && s.valueTotal > 0
          ? round(
              (s.total / (s.valueCovered * s.valueTotal)) * 100
            )
          : null,

      byAccount: s.accounts.map((a) => ({
        account: a.account,
        owner: a.owner === "spouse" ? "Spouse" : "Self",
        value: round(a.value),
        distributions: a.total === null ? null : round(a.total),
        trailingYieldPct:
          a.trailingYield === null ? null : round(a.trailingYield),
        payments: a.payments,
        reinvested: round(a.reinvested),
        paidAsCash: round(a.cash),
        status: a.status,
        observedFrom: a.observedFrom,
        note: a.note,
      })),

      topPayers: s.topPayers.slice(0, 15).map((p) => ({
        payer: p.payer,
        account: p.account,
        owner: p.owner === "spouse" ? "Spouse" : "Self",
        total: round(p.total),
        payments: p.payments,
        reinvested: round(p.reinvested),
        paidAsCash: round(p.cash),
        from: p.first,
        to: p.last,
      })),

      // Named, so "we don't know" cannot be read as "zero".
      gaps: s.gaps,
      rowsExcludedAsNotIncome: s.excluded,

      note:
        "Figures are recorded distributions, not estimates — no yield table is used. Dividends, capital gain distributions and interest are counted together, which is what the custodian reports. Accounts listed under `gaps` contribute nothing to the total: an employer plan that does not report distributions to Plaid is indistinguishable from one that paid none, so neither is assumed.",
    };
  },
});
