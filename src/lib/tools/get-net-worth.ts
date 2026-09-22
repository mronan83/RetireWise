import { tool } from "ai";
import { z } from "zod";
import { getApiUserId } from "@/lib/auth-helpers";
import { eq } from "drizzle-orm";
import { getDb } from "../db";
import { realEstate, cashReserves, debts, vehicles } from "../db/schema";
import { loadNetWorth } from "../net-worth/load";
import { getHoldingsByClerkId } from "../queries/holdings";
import { DEBT_TYPE_LABELS, CASH_TYPE_LABELS } from "../constants-net-worth";
import { ACCOUNT_OWNER_LABELS } from "../constants";

export const getNetWorthTool = tool({
  description:
    "Get the complete household net worth breakdown: investments + real estate + cash reserves - debts. Shows each category with details.",
  inputSchema: z.object({}),
  execute: async () => {
    // Holdings are keyed by the household id, not the signed-in account's own
    // id; the raw id reads back an empty portfolio instead of an error.
    const userId = await getApiUserId();
    if (!userId) return { error: "Not authenticated" };

    const db = getDb();
    const [composed, properties, cash, debtsList, vehiclesList] = await Promise.all([
      // Composed in src/lib/net-worth/compose.ts. This tool used to sum it
      // here — the fifth place that did — and it both subtracted asset loans
      // twice and left vehicles out of the total altogether, so asking for
      // the household's net worth returned a figure no screen agreed with.
      loadNetWorth(userId),
      db.select().from(realEstate).where(eq(realEstate.clerkId, userId)),
      db.select().from(cashReserves).where(eq(cashReserves.clerkId, userId)),
      db.select().from(debts).where(eq(debts.clerkId, userId)),
      db.select().from(vehicles).where(eq(vehicles.clerkId, userId)),
    ]);

    const owedBy = new Map(composed.assets.map((a) => [a.id, a]));
    const investmentTotal = composed.investments;
    const realEstateTotal = properties.reduce((s, p) => s + Number(p.estimatedValue), 0);
    const realEstateEquity = composed.assets
      .filter((a) => a.kind === "real_estate")
      .reduce((s, a) => s + a.equity, 0);
    const vehicleTotal = vehiclesList.reduce((s, v) => s + Number(v.estimatedValue), 0);
    const vehicleEquity = composed.assets
      .filter((a) => a.kind === "vehicle")
      .reduce((s, a) => s + a.equity, 0);
    const cashTotal = composed.cash;
    // Every liability. This returned only the unsecured ones, under the name
    // totalDebts, with a note explaining why — so asked "how much do we owe",
    // the assistant answered $12,836.07 for a household owing $282,545.22 and
    // had a paragraph ready to justify it.
    const debtTotal = composed.liabilities;
    const monthlyDebtPayments = debtsList.reduce((s, d) => s + Number(d.monthlyPayment), 0);

    const totalAssets = composed.grossAssets;
    const netWorth = composed.netWorth;

    return {
      netWorth: Math.round(netWorth),
      totalAssets: Math.round(totalAssets),
      totalDebts: Math.round(debtTotal),
      securedDebts: Math.round(composed.secured),
      unsecuredDebts: Math.round(composed.unsecured),
      breakdown: {
        investments: Math.round(investmentTotal),
        realEstate: Math.round(realEstateTotal),
        realEstateEquity: Math.round(realEstateEquity),
        vehicles: Math.round(vehicleTotal),
        vehicleEquity: Math.round(vehicleEquity),
        cashReserves: Math.round(cashTotal),
      },
      note:
        "totalAssets is gross — the full value of investments, cash, property and vehicles. " +
        "totalDebts is every liability, secured and unsecured, so netWorth = totalAssets - totalDebts. " +
        "Per-asset equity is given separately as realEstateEquity and vehicleEquity; do not subtract " +
        "those loans a second time.",
      properties: properties.map((p) => ({
        name: p.name,
        owner: ACCOUNT_OWNER_LABELS[p.owner],
        value: Number(p.estimatedValue),
        mortgageBalance: owedBy.get(p.id)?.owed ?? Number(p.mortgageBalance || 0),
        equity: owedBy.get(p.id)?.equity ?? Number(p.estimatedValue),
        securedBy: owedBy.get(p.id)?.securedBy.map((l) => l.name) ?? [],
        monthlyPayment: p.monthlyPayment ? Number(p.monthlyPayment) : null,
        isPrimary: p.isPrimaryResidence,
      })),
      cashAccounts: cash.map((c) => ({
        name: c.name,
        owner: ACCOUNT_OWNER_LABELS[c.owner],
        type: CASH_TYPE_LABELS[c.accountType],
        balance: Number(c.balance),
        apy: c.interestRate ? Number(c.interestRate) : null,
      })),
      vehicleDetails: vehiclesList.map((v) => ({
        name: v.name,
        owner: ACCOUNT_OWNER_LABELS[v.owner],
        value: Number(v.estimatedValue),
        loanBalance: owedBy.get(v.id)?.owed ?? 0,
        equity: owedBy.get(v.id)?.equity ?? Number(v.estimatedValue),
        securedBy: owedBy.get(v.id)?.securedBy.map((l) => l.name) ?? [],
      })),
      debtDetails: debtsList.map((d) => ({
        name: d.name,
        securedAgainst: d.securedById
          ? composed.assets.find((a) => a.id === d.securedById)?.name ?? null
          : null,
        owner: ACCOUNT_OWNER_LABELS[d.owner],
        type: DEBT_TYPE_LABELS[d.debtType],
        balance: Number(d.currentBalance),
        rate: Number(d.interestRate),
        monthlyPayment: Number(d.monthlyPayment),
        payoffDate: d.payoffDate,
      })),
      monthlyDebtPayments: Math.round(monthlyDebtPayments),
    };
  },
});
