"use server";

import { requireWriteClerkId, withWriteHousehold } from "@/lib/auth-helpers";
import { revalidatePath } from "next/cache";
import { eq, and } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "../db";
import { realEstate, cashReserves, debts, vehicles } from "../db/schema";
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

export async function createRealEstate(
  ...args: Parameters<typeof createRealEstateImpl>
) {
  return withWriteHousehold(() => createRealEstateImpl(...args));
}

async function createRealEstateImpl(formData: FormData) {
  // Rows are keyed by the household id, not the signed-in account's own id.
  const userId = await requireWriteClerkId();
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

export async function updateRealEstate(
  ...args: Parameters<typeof updateRealEstateImpl>
) {
  return withWriteHousehold(() => updateRealEstateImpl(...args));
}

async function updateRealEstateImpl(id: string, formData: FormData) {
  // Rows are keyed by the household id, not the signed-in account's own id.
  const userId = await requireWriteClerkId();
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

export async function deleteRealEstate(
  ...args: Parameters<typeof deleteRealEstateImpl>
) {
  return withWriteHousehold(() => deleteRealEstateImpl(...args));
}

async function deleteRealEstateImpl(id: string) {
  // Rows are keyed by the household id, not the signed-in account's own id.
  const userId = await requireWriteClerkId();
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

export async function createCashReserve(
  ...args: Parameters<typeof createCashReserveImpl>
) {
  return withWriteHousehold(() => createCashReserveImpl(...args));
}

async function createCashReserveImpl(formData: FormData) {
  // Rows are keyed by the household id, not the signed-in account's own id.
  const userId = await requireWriteClerkId();
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

export async function updateCashReserve(
  ...args: Parameters<typeof updateCashReserveImpl>
) {
  return withWriteHousehold(() => updateCashReserveImpl(...args));
}

async function updateCashReserveImpl(id: string, formData: FormData) {
  // Rows are keyed by the household id, not the signed-in account's own id.
  const userId = await requireWriteClerkId();
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

export async function deleteCashReserve(
  ...args: Parameters<typeof deleteCashReserveImpl>
) {
  return withWriteHousehold(() => deleteCashReserveImpl(...args));
}

async function deleteCashReserveImpl(id: string) {
  // Rows are keyed by the household id, not the signed-in account's own id.
  const userId = await requireWriteClerkId();
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
  /**
   * The asset this loan is secured against, as "kind:id", or absent.
   *
   * Naming it makes this balance the amount owed on that asset and retires
   * the loan figure stored on the asset itself. Without it both are
   * subtracted and the household's net worth is understated by the loan —
   * which is what a bank connection did to two car loans already typed in.
   */
  securedBy: z.string().optional(),
});

/** "vehicle:uuid" from the form, validated against the household's assets. */
async function resolveSecuredBy(
  clerkId: string,
  raw: string | undefined
): Promise<{ securedByType: "real_estate" | "vehicle" | null; securedById: string | null }> {
  const none = { securedByType: null, securedById: null };
  if (!raw || raw === "none") return none;

  const [kind, id] = raw.split(":");
  if (kind !== "real_estate" && kind !== "vehicle") return none;
  if (!id) return none;

  const table = kind === "vehicle" ? vehicles : realEstate;
  const owned = await getDb()
    .select({ id: table.id })
    .from(table)
    .where(and(eq(table.id, id), eq(table.clerkId, clerkId)))
    .limit(1);
  if (owned.length === 0) {
    throw new Error("That asset is not in this household.");
  }
  return { securedByType: kind, securedById: id };
}

export async function createDebt(
  ...args: Parameters<typeof createDebtImpl>
) {
  return withWriteHousehold(() => createDebtImpl(...args));
}

async function createDebtImpl(formData: FormData) {
  // Rows are keyed by the household id, not the signed-in account's own id.
  const userId = await requireWriteClerkId();
  const parsed = debtSchema.parse({
    owner: formData.get("owner") || "self",
    name: formData.get("name"),
    debtType: formData.get("debtType"),
    currentBalance: formData.get("currentBalance"),
    interestRate: formData.get("interestRate"),
    monthlyPayment: formData.get("monthlyPayment"),
    payoffDate: formData.get("payoffDate") || undefined,
    notes: formData.get("notes") || undefined,
    securedBy: formData.get("securedBy") || undefined,
  });
  const secured = await resolveSecuredBy(userId, parsed.securedBy);
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
    ...secured,
  }).returning({ id: debts.id, name: debts.name });
  if (inserted) {
    recordItemHistory(userId, "debt", inserted.id, inserted.name, parsed.currentBalance).catch(() => {});
  }
  revalidatePath("/net-worth");
}

export async function updateDebt(
  ...args: Parameters<typeof updateDebtImpl>
) {
  return withWriteHousehold(() => updateDebtImpl(...args));
}

async function updateDebtImpl(id: string, formData: FormData) {
  // Rows are keyed by the household id, not the signed-in account's own id.
  const userId = await requireWriteClerkId();
  const parsed = debtSchema.parse({
    owner: formData.get("owner") || "self",
    name: formData.get("name"),
    debtType: formData.get("debtType"),
    currentBalance: formData.get("currentBalance"),
    interestRate: formData.get("interestRate"),
    monthlyPayment: formData.get("monthlyPayment"),
    payoffDate: formData.get("payoffDate") || undefined,
    notes: formData.get("notes") || undefined,
    securedBy: formData.get("securedBy") || undefined,
  });
  const secured = await resolveSecuredBy(userId, parsed.securedBy);
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
    ...secured,
  }).where(and(eq(debts.id, id), eq(debts.clerkId, userId)));
  recordItemHistory(userId, "debt", id, parsed.name, parsed.currentBalance).catch(() => {});
  await snapshotNetWorth(userId).catch(() => {});
  revalidatePath("/net-worth");
  revalidatePath("/dashboard");
}

export async function deleteDebt(
  ...args: Parameters<typeof deleteDebtImpl>
) {
  return withWriteHousehold(() => deleteDebtImpl(...args));
}

async function deleteDebtImpl(id: string) {
  // Rows are keyed by the household id, not the signed-in account's own id.
  const userId = await requireWriteClerkId();
  const db = getDb();
  await db.delete(debts).where(and(eq(debts.id, id), eq(debts.clerkId, userId)));
  revalidatePath("/net-worth");
}
