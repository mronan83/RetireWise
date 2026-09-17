"use server";

import { auth } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { eq, and } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "../db";
import { realEstate, cashReserves, debts } from "../db/schema";
import { snapshotNetWorth } from "../utils/net-worth-snapshot";
import { recordItemHistory } from "../utils/record-item-history";

// Real Estate
const realEstateSchema = z.object({
  owner: z.enum(["self", "spouse"]),
  name: z.string().min(1),
  address: z.string().optional(),
  estimatedValue: z.coerce.number().min(0),
  mortgageBalance: z.coerce.number().min(0).optional(),
  mortgageRate: z.coerce.number().min(0).optional(),
  monthlyPayment: z.coerce.number().min(0).optional(),
  isPrimaryResidence: z.coerce.boolean().optional(),
  lastValuationDate: z.string().optional(),
  notes: z.string().optional(),
});

export async function createRealEstate(formData: FormData) {
  const { userId } = await auth();
  if (!userId) throw new Error("Unauthorized");
  const parsed = realEstateSchema.parse({
    owner: formData.get("owner") || "self",
    name: formData.get("name"),
    address: formData.get("address") || undefined,
    estimatedValue: formData.get("estimatedValue"),
    mortgageBalance: formData.get("mortgageBalance") || undefined,
    mortgageRate: formData.get("mortgageRate") || undefined,
    monthlyPayment: formData.get("monthlyPayment") || undefined,
    isPrimaryResidence: formData.get("isPrimaryResidence") === "on",
    lastValuationDate: formData.get("lastValuationDate") || undefined,
    notes: formData.get("notes") || undefined,
  });
  const db = getDb();
  const [inserted] = await db.insert(realEstate).values({
    clerkId: userId,
    owner: parsed.owner,
    name: parsed.name,
    address: parsed.address || null,
    estimatedValue: String(parsed.estimatedValue),
    mortgageBalance: String(parsed.mortgageBalance || 0),
    mortgageRate: parsed.mortgageRate ? String(parsed.mortgageRate) : null,
    monthlyPayment: parsed.monthlyPayment ? String(parsed.monthlyPayment) : null,
    isPrimaryResidence: parsed.isPrimaryResidence ?? true,
    lastValuationDate: parsed.lastValuationDate || null,
    notes: parsed.notes || null,
  }).returning({ id: realEstate.id, name: realEstate.name });
  if (inserted) {
    const equity = parsed.estimatedValue - (parsed.mortgageBalance || 0);
    recordItemHistory(userId, "real_estate", inserted.id, inserted.name, equity, parsed.estimatedValue).catch(() => {});
  }
  revalidatePath("/net-worth");
}

export async function updateRealEstate(id: string, formData: FormData) {
  const { userId } = await auth();
  if (!userId) throw new Error("Unauthorized");
  const parsed = realEstateSchema.parse({
    owner: formData.get("owner") || "self",
    name: formData.get("name"),
    address: formData.get("address") || undefined,
    estimatedValue: formData.get("estimatedValue"),
    mortgageBalance: formData.get("mortgageBalance") || undefined,
    mortgageRate: formData.get("mortgageRate") || undefined,
    monthlyPayment: formData.get("monthlyPayment") || undefined,
    isPrimaryResidence: formData.get("isPrimaryResidence") === "on",
    lastValuationDate: formData.get("lastValuationDate") || undefined,
    notes: formData.get("notes") || undefined,
  });
  const db = getDb();
  await db.update(realEstate).set({
    owner: parsed.owner,
    name: parsed.name,
    address: parsed.address || null,
    estimatedValue: String(parsed.estimatedValue),
    mortgageBalance: String(parsed.mortgageBalance || 0),
    mortgageRate: parsed.mortgageRate ? String(parsed.mortgageRate) : null,
    monthlyPayment: parsed.monthlyPayment ? String(parsed.monthlyPayment) : null,
    isPrimaryResidence: parsed.isPrimaryResidence ?? true,
    lastValuationDate: parsed.lastValuationDate || null,
    notes: parsed.notes || null,
  }).where(and(eq(realEstate.id, id), eq(realEstate.clerkId, userId)));
  const equity = parsed.estimatedValue - (parsed.mortgageBalance || 0);
  recordItemHistory(userId, "real_estate", id, parsed.name, equity, parsed.estimatedValue).catch(() => {});
  await snapshotNetWorth(userId).catch(() => {});
  revalidatePath("/net-worth");
  revalidatePath("/dashboard");
}

export async function deleteRealEstate(id: string) {
  const { userId } = await auth();
  if (!userId) throw new Error("Unauthorized");
  const db = getDb();
  await db.delete(realEstate).where(and(eq(realEstate.id, id), eq(realEstate.clerkId, userId)));
  revalidatePath("/net-worth");
}

// Cash Reserves
const cashSchema = z.object({
  owner: z.enum(["self", "spouse"]),
  name: z.string().min(1),
  accountType: z.enum(["checking", "savings", "high_yield_savings", "money_market", "cd", "ibonds", "emergency_fund", "other_cash"]),
  institution: z.string().optional(),
  balance: z.coerce.number().min(0),
  interestRate: z.coerce.number().min(0).optional(),
  notes: z.string().optional(),
});

export async function createCashReserve(formData: FormData) {
  const { userId } = await auth();
  if (!userId) throw new Error("Unauthorized");
  const parsed = cashSchema.parse({
    owner: formData.get("owner") || "self",
    name: formData.get("name"),
    accountType: formData.get("accountType"),
    institution: formData.get("institution") || undefined,
    balance: formData.get("balance"),
    interestRate: formData.get("interestRate") || undefined,
    notes: formData.get("notes") || undefined,
  });
  const db = getDb();
  const [inserted] = await db.insert(cashReserves).values({
    clerkId: userId,
    owner: parsed.owner,
    name: parsed.name,
    accountType: parsed.accountType,
    institution: parsed.institution || null,
    balance: String(parsed.balance),
    interestRate: parsed.interestRate ? String(parsed.interestRate) : null,
    notes: parsed.notes || null,
  }).returning({ id: cashReserves.id, name: cashReserves.name });
  if (inserted) {
    recordItemHistory(userId, "cash_reserve", inserted.id, inserted.name, parsed.balance).catch(() => {});
  }
  revalidatePath("/net-worth");
}

export async function updateCashReserve(id: string, formData: FormData) {
  const { userId } = await auth();
  if (!userId) throw new Error("Unauthorized");
  const parsed = cashSchema.parse({
    owner: formData.get("owner") || "self",
    name: formData.get("name"),
    accountType: formData.get("accountType"),
    institution: formData.get("institution") || undefined,
    balance: formData.get("balance"),
    interestRate: formData.get("interestRate") || undefined,
    notes: formData.get("notes") || undefined,
  });
  const db = getDb();
  await db.update(cashReserves).set({
    owner: parsed.owner,
    name: parsed.name,
    accountType: parsed.accountType,
    institution: parsed.institution || null,
    balance: String(parsed.balance),
    interestRate: parsed.interestRate ? String(parsed.interestRate) : null,
    notes: parsed.notes || null,
  }).where(and(eq(cashReserves.id, id), eq(cashReserves.clerkId, userId)));
  recordItemHistory(userId, "cash_reserve", id, parsed.name, parsed.balance).catch(() => {});
  await snapshotNetWorth(userId).catch(() => {});
  revalidatePath("/net-worth");
  revalidatePath("/dashboard");
}

export async function deleteCashReserve(id: string) {
  const { userId } = await auth();
  if (!userId) throw new Error("Unauthorized");
  const db = getDb();
  await db.delete(cashReserves).where(and(eq(cashReserves.id, id), eq(cashReserves.clerkId, userId)));
  revalidatePath("/net-worth");
}

// Debts
const debtSchema = z.object({
  owner: z.enum(["self", "spouse"]),
  name: z.string().min(1),
  debtType: z.enum(["mortgage", "auto_loan", "student_loan", "heloc", "personal_loan", "credit_card", "other_debt"]),
  currentBalance: z.coerce.number().min(0),
  interestRate: z.coerce.number().min(0),
  monthlyPayment: z.coerce.number().min(0),
  payoffDate: z.string().optional(),
  notes: z.string().optional(),
});

export async function createDebt(formData: FormData) {
  const { userId } = await auth();
  if (!userId) throw new Error("Unauthorized");
  const parsed = debtSchema.parse({
    owner: formData.get("owner") || "self",
    name: formData.get("name"),
    debtType: formData.get("debtType"),
    currentBalance: formData.get("currentBalance"),
    interestRate: formData.get("interestRate"),
    monthlyPayment: formData.get("monthlyPayment"),
    payoffDate: formData.get("payoffDate") || undefined,
    notes: formData.get("notes") || undefined,
  });
  const db = getDb();
  const [inserted] = await db.insert(debts).values({
    clerkId: userId,
    owner: parsed.owner,
    name: parsed.name,
    debtType: parsed.debtType,
    currentBalance: String(parsed.currentBalance),
    interestRate: String(parsed.interestRate),
    monthlyPayment: String(parsed.monthlyPayment),
    payoffDate: parsed.payoffDate || null,
    notes: parsed.notes || null,
  }).returning({ id: debts.id, name: debts.name });
  if (inserted) {
    recordItemHistory(userId, "debt", inserted.id, inserted.name, parsed.currentBalance).catch(() => {});
  }
  revalidatePath("/net-worth");
}

export async function updateDebt(id: string, formData: FormData) {
  const { userId } = await auth();
  if (!userId) throw new Error("Unauthorized");
  const parsed = debtSchema.parse({
    owner: formData.get("owner") || "self",
    name: formData.get("name"),
    debtType: formData.get("debtType"),
    currentBalance: formData.get("currentBalance"),
    interestRate: formData.get("interestRate"),
    monthlyPayment: formData.get("monthlyPayment"),
    payoffDate: formData.get("payoffDate") || undefined,
    notes: formData.get("notes") || undefined,
  });
  const db = getDb();
  await db.update(debts).set({
    owner: parsed.owner,
    name: parsed.name,
    debtType: parsed.debtType,
    currentBalance: String(parsed.currentBalance),
    interestRate: String(parsed.interestRate),
    monthlyPayment: String(parsed.monthlyPayment),
    payoffDate: parsed.payoffDate || null,
    notes: parsed.notes || null,
  }).where(and(eq(debts.id, id), eq(debts.clerkId, userId)));
  recordItemHistory(userId, "debt", id, parsed.name, parsed.currentBalance).catch(() => {});
  await snapshotNetWorth(userId).catch(() => {});
  revalidatePath("/net-worth");
  revalidatePath("/dashboard");
}

export async function deleteDebt(id: string) {
  const { userId } = await auth();
  if (!userId) throw new Error("Unauthorized");
  const db = getDb();
  await db.delete(debts).where(and(eq(debts.id, id), eq(debts.clerkId, userId)));
  revalidatePath("/net-worth");
}
