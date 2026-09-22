"use server";

import { requireWriteClerkId, withWriteHousehold } from "@/lib/auth-helpers";
import { revalidatePath } from "next/cache";
import { eq, and, desc } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "../db";
import { cashReserves, debts, netWorthItemHistory } from "../db/schema";
import { snapshotNetWorth } from "../utils/net-worth-snapshot";
import { recordItemHistory } from "../utils/record-item-history";

/**
 * Write a balance read from an OFX/QFX statement into a debt or cash account.
 *
 * Everything that could be guessed has already been settled on screen by the
 * owner: which account this is, what it should be called, and — for a card,
 * where the two sign conventions in the wild disagree — whether the figure is
 * money owed or money held. This writes what was confirmed.
 *
 * Two things it refuses to do quietly, because both would put a plausible
 * number where there should have been none:
 *
 *   A STATEMENT IS NOT TODAY. An OFX export is a closed statement, so its
 *   balance is as of the statement date, which can be a month old. Writing it
 *   over a fresher figure moves a balance backwards, and a debt payoff goal
 *   measuring net change from a baseline would read that as borrowing. So a
 *   statement older than what is already recorded is refused, and the caller
 *   has to say explicitly that it should be applied anyway.
 *
 *   A LINKED ACCOUNT IS NOT OURS TO EDIT. A balance on a Plaid-linked row is
 *   replaced by the next sync. Writing to one looks like it worked and then
 *   silently reverts, which is worse than refusing.
 */

const importSchema = z.object({
  target: z.enum(["debt", "cash"]),
  /** Null creates a new row; an id updates that one. */
  existingId: z.string().uuid().nullable(),
  name: z.string().min(1).max(200),
  owner: z.enum(["self", "spouse"]),
  /** In RetireWise's own sign: positive is money owed on a debt, held in cash. */
  balance: z.number().finite(),
  /** The statement's as-of date, YYYY-MM-DD. Null when the file omits one. */
  asOf: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  debtType: z
    .enum(["mortgage", "auto_loan", "student_loan", "heloc", "personal_loan", "credit_card", "other_debt"])
    .optional(),
  cashType: z
    .enum(["checking", "savings", "high_yield_savings", "money_market", "cd", "ibonds", "emergency_fund", "other_cash"])
    .optional(),
  institution: z.string().max(200).nullable().optional(),
  /** Last four only. The full number is never sent here. */
  accountTail: z.string().max(4).nullable().optional(),
  /** Set only after the owner has been shown, and accepted, a refusal below. */
  force: z.boolean().optional(),
});

export type StatementImportInput = z.input<typeof importSchema>;

export type StatementImportResult =
  | { status: "created"; id: string; name: string; balance: number }
  | { status: "updated"; id: string; name: string; was: number; now: number }
  | {
      /** The statement predates what is already recorded. Not written. */
      status: "stale";
      recordedOn: string;
      statementDate: string;
      currentBalance: number;
    }
  | {
      /** The row is kept current by a bank connection. Not written. */
      status: "linked";
      name: string;
    }
  | {
      /** A card in credit is not a debt. Not written. */
      status: "credit_balance";
      amount: number;
    };

export async function importStatementBalance(
  ...args: Parameters<typeof importStatementBalanceImpl>
) {
  return withWriteHousehold(() => importStatementBalanceImpl(...args));
}

async function importStatementBalanceImpl(
  input: StatementImportInput
): Promise<StatementImportResult> {
  // Rows are keyed by the household id, not the signed-in account's own id.
  const userId = await requireWriteClerkId();
  const p = importSchema.parse(input);
  const db = getDb();

  // A card the issuer owes money on is not a liability of any size. Writing
  // it as one would make "Total Debts" wrong in the direction nobody checks.
  if (p.target === "debt" && p.balance < 0) {
    return { status: "credit_balance", amount: Math.abs(p.balance) };
  }

  const note = [
    p.institution?.trim() || null,
    p.accountTail ? `account ····${p.accountTail}` : null,
    p.asOf ? `statement of ${p.asOf}` : "statement date not given",
  ]
    .filter(Boolean)
    .join(" · ");

  // ---- updating an account that already exists ----------------------------
  if (p.existingId) {
    const current =
      p.target === "debt"
        ? await db
            .select({
              id: debts.id,
              name: debts.name,
              balance: debts.currentBalance,
              plaidAccountId: debts.plaidAccountId,
            })
            .from(debts)
            .where(and(eq(debts.id, p.existingId), eq(debts.clerkId, userId)))
            .limit(1)
        : await db
            .select({
              id: cashReserves.id,
              name: cashReserves.name,
              balance: cashReserves.balance,
              plaidAccountId: cashReserves.plaidAccountId,
            })
            .from(cashReserves)
            .where(and(eq(cashReserves.id, p.existingId), eq(cashReserves.clerkId, userId)))
            .limit(1);

    const row = current[0];
    if (!row) throw new Error("That account is not in this household.");

    if (row.plaidAccountId && !p.force) {
      return { status: "linked", name: row.name };
    }

    // The freshest thing known about this balance. `updated_at` is not it —
    // the net worth forms do not touch that column on an edit — so the item
    // history, which every balance change writes, is what is compared.
    if (p.asOf && !p.force) {
      const [latest] = await db
        .select({ recordedDate: netWorthItemHistory.recordedDate })
        .from(netWorthItemHistory)
        .where(
          and(
            eq(netWorthItemHistory.clerkId, userId),
            eq(netWorthItemHistory.itemId, p.existingId)
          )
        )
        .orderBy(desc(netWorthItemHistory.recordedDate))
        .limit(1);

      if (latest && latest.recordedDate > p.asOf) {
        return {
          status: "stale",
          recordedOn: latest.recordedDate,
          statementDate: p.asOf,
          currentBalance: Number(row.balance),
        };
      }
    }

    const was = Number(row.balance);

    if (p.target === "debt") {
      await db
        .update(debts)
        .set({
          name: p.name,
          currentBalance: String(p.balance),
          ...(p.debtType ? { debtType: p.debtType } : {}),
          dataSource: "csv_import" as const,
          notes: note,
          updatedAt: new Date(),
        })
        .where(and(eq(debts.id, p.existingId), eq(debts.clerkId, userId)));
    } else {
      await db
        .update(cashReserves)
        .set({
          name: p.name,
          balance: String(p.balance),
          ...(p.cashType ? { accountType: p.cashType } : {}),
          ...(p.institution ? { institution: p.institution } : {}),
          dataSource: "csv_import" as const,
          notes: note,
          updatedAt: new Date(),
        })
        .where(and(eq(cashReserves.id, p.existingId), eq(cashReserves.clerkId, userId)));
    }

    await recordItemHistory(
      userId,
      p.target === "debt" ? "debt" : "cash_reserve",
      p.existingId,
      p.name,
      p.balance
    ).catch(() => {});
    await snapshotNetWorth(userId).catch(() => {});
    revalidatePath("/net-worth");
    revalidatePath("/dashboard");

    return { status: "updated", id: p.existingId, name: p.name, was, now: p.balance };
  }

  // ---- a new account ------------------------------------------------------
  // The rate and the monthly payment are not in an OFX statement. They are
  // written as zero because the columns are NOT NULL, and zero is read as
  // "not reported" everywhere it is displayed — the same reading a missing
  // cost basis gets. A rate of 0% invented here would make every payoff
  // projection wrong and look deliberate.
  let insertedId: string;
  if (p.target === "debt") {
    const [row] = await db
      .insert(debts)
      .values({
        clerkId: userId,
        owner: p.owner,
        name: p.name,
        debtType: p.debtType ?? "other_debt",
        currentBalance: String(p.balance),
        interestRate: "0",
        monthlyPayment: "0",
        notes: note,
        dataSource: "csv_import" as const,
      })
      .returning({ id: debts.id });
    insertedId = row.id;
  } else {
    const [row] = await db
      .insert(cashReserves)
      .values({
        clerkId: userId,
        owner: p.owner,
        name: p.name,
        accountType: p.cashType ?? "other_cash",
        institution: p.institution ?? null,
        balance: String(p.balance),
        notes: note,
        dataSource: "csv_import" as const,
      })
      .returning({ id: cashReserves.id });
    insertedId = row.id;
  }

  await recordItemHistory(
    userId,
    p.target === "debt" ? "debt" : "cash_reserve",
    insertedId,
    p.name,
    p.balance
  ).catch(() => {});
  await snapshotNetWorth(userId).catch(() => {});
  revalidatePath("/net-worth");
  revalidatePath("/dashboard");

  return { status: "created", id: insertedId, name: p.name, balance: p.balance };
}
