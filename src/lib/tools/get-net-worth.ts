import { tool } from "ai";
import { z } from "zod";
import { auth } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";
import { getDb } from "../db";
import { realEstate, cashReserves, debts } from "../db/schema";
import { getHoldingsByClerkId } from "../queries/holdings";
import { DEBT_TYPE_LABELS, CASH_TYPE_LABELS } from "../constants-net-worth";
import { ACCOUNT_OWNER_LABELS } from "../constants";

export const getNetWorthTool = tool({
  description:
    "Get the complete household net worth breakdown: investments + real estate + cash reserves - debts. Shows each category with details.",
  inputSchema: z.object({}),
  execute: async () => {
    const { userId } = await auth();
    if (!userId) return { error: "Not authenticated" };

    const db = getDb();
    const [holdings, properties, cash, debtsList] = await Promise.all([
      getHoldingsByClerkId(userId),
      db.select().from(realEstate).where(eq(realEstate.clerkId, userId)),
      db.select().from(cashReserves).where(eq(cashReserves.clerkId, userId)),
      db.select().from(debts).where(eq(debts.clerkId, userId)),
    ]);

    const investmentTotal = holdings.reduce((s, h) => s + Number(h.currentValue), 0);
    const realEstateTotal = properties.reduce((s, p) => s + Number(p.estimatedValue), 0);
    const realEstateEquity = properties.reduce(
      (s, p) => s + Number(p.estimatedValue) - Number(p.mortgageBalance || 0), 0
    );
    const cashTotal = cash.reduce((s, c) => s + Number(c.balance), 0);
    const debtTotal = debtsList.reduce((s, d) => s + Number(d.currentBalance), 0);
    const monthlyDebtPayments = debtsList.reduce((s, d) => s + Number(d.monthlyPayment), 0);

    const totalAssets = investmentTotal + realEstateTotal + cashTotal;
    const netWorth = totalAssets - debtTotal;

    return {
      netWorth: Math.round(netWorth),
      totalAssets: Math.round(totalAssets),
      totalDebts: Math.round(debtTotal),
      breakdown: {
        investments: Math.round(investmentTotal),
        realEstate: Math.round(realEstateTotal),
        realEstateEquity: Math.round(realEstateEquity),
        cashReserves: Math.round(cashTotal),
      },
      properties: properties.map((p) => ({
        name: p.name,
        owner: ACCOUNT_OWNER_LABELS[p.owner],
        value: Number(p.estimatedValue),
        mortgageBalance: Number(p.mortgageBalance || 0),
        equity: Number(p.estimatedValue) - Number(p.mortgageBalance || 0),
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
      debtDetails: debtsList.map((d) => ({
        name: d.name,
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
