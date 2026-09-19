"use server";

import { requireWriteClerkId } from "@/lib/auth-helpers";
import { revalidatePath } from "next/cache";
import { eq, and } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "../db";
import { contributions } from "../db/schema";

const contributionSchema = z.object({
  owner: z.enum(["self", "spouse"]),
  accountId: z.string().optional(),
  label: z.string().min(1, "Label is required"),
  accountType: z.enum([
    "401k",
    "403b",
    "ira_traditional",
    "ira_roth",
    "brokerage",
    "hsa",
    "529",
    "pension",
    "annuity",
    "other",
  ]),
  contributionMethod: z.enum(["percent_of_salary", "fixed_amount"]),
  contributionPercent: z.coerce.number().min(0).max(100).optional(),
  contributionAmount: z.coerce.number().min(0).optional(),
  frequency: z.enum([
    "per_paycheck_biweekly",
    "per_paycheck_semimonthly",
    "monthly",
    "quarterly",
    "annually",
  ]),
  hasAnnualEscalation: z.coerce.boolean().optional(),
  annualEscalationAmount: z.coerce.number().min(0).optional(),
  maxAnnualContribution: z.coerce.number().min(0).optional(),
  hasEmployerMatch: z.coerce.boolean().optional(),
  employerMatchRate: z.coerce.number().min(0).max(10).optional(),
  employerMatchMaxPercent: z.coerce.number().min(0).max(100).optional(),
  hasEmployerNonElective: z.coerce.boolean().optional(),
  employerNonElectivePercent: z.coerce.number().min(0).max(100).optional(),
  employerNonElectiveAmount: z.coerce.number().min(0).optional(),
  vestingSchedule: z.enum(["immediate", "cliff", "graded"]).optional(),
  vestingYears: z.coerce.number().int().min(0).max(20).optional(),
  serviceStartDate: z.string().optional(),
});

/** Read the fields shared by the create and edit forms. */
function readForm(formData: FormData) {
  return contributionSchema.parse({
    owner: formData.get("owner"),
    accountId: formData.get("accountId") || undefined,
    label: formData.get("label"),
    accountType: formData.get("accountType"),
    contributionMethod: formData.get("contributionMethod"),
    contributionPercent: formData.get("contributionPercent") || undefined,
    contributionAmount: formData.get("contributionAmount") || undefined,
    frequency: formData.get("frequency"),
    hasAnnualEscalation: formData.get("hasAnnualEscalation") === "on",
    annualEscalationAmount: formData.get("annualEscalationAmount") || undefined,
    maxAnnualContribution: formData.get("maxAnnualContribution") || undefined,
    hasEmployerMatch: formData.get("hasEmployerMatch") === "on",
    employerMatchRate: formData.get("employerMatchRate") || undefined,
    employerMatchMaxPercent: formData.get("employerMatchMaxPercent") || undefined,
    hasEmployerNonElective: formData.get("hasEmployerNonElective") === "on",
    employerNonElectivePercent:
      formData.get("employerNonElectivePercent") || undefined,
    employerNonElectiveAmount:
      formData.get("employerNonElectiveAmount") || undefined,
    vestingSchedule: formData.get("vestingSchedule") || undefined,
    vestingYears: formData.get("vestingYears") || undefined,
    serviceStartDate: formData.get("serviceStartDate") || undefined,
  });
}

/** Map the parsed form onto the columns, since numerics are stored as text. */
function toColumns(parsed: z.infer<typeof contributionSchema>) {
  const num = (v: number | undefined) => (v === undefined ? null : String(v));
  return {
    owner: parsed.owner,
    accountId: parsed.accountId || null,
    label: parsed.label,
    accountType: parsed.accountType,
    contributionMethod: parsed.contributionMethod,
    contributionPercent: num(parsed.contributionPercent),
    contributionAmount: num(parsed.contributionAmount),
    frequency: parsed.frequency,
    hasAnnualEscalation: parsed.hasAnnualEscalation || false,
    annualEscalationAmount: num(parsed.annualEscalationAmount),
    maxAnnualContribution: num(parsed.maxAnnualContribution),
    hasEmployerMatch: parsed.hasEmployerMatch || false,
    employerMatchRate: num(parsed.employerMatchRate),
    employerMatchMaxPercent: num(parsed.employerMatchMaxPercent),
    hasEmployerNonElective: parsed.hasEmployerNonElective || false,
    employerNonElectivePercent: num(parsed.employerNonElectivePercent),
    employerNonElectiveAmount: num(parsed.employerNonElectiveAmount),
    vestingSchedule: parsed.vestingSchedule ?? ("immediate" as const),
    vestingYears: parsed.vestingYears ?? null,
    serviceStartDate: parsed.serviceStartDate || null,
  };
}

function revalidateAll() {
  revalidatePath("/settings");
  revalidatePath("/accounts");
  revalidatePath("/projections");
  revalidatePath("/analytics");
}

export async function createContribution(formData: FormData) {
  // Rows are keyed by the household id, not the signed-in account's own id.
  const userId = await requireWriteClerkId();
  const parsed = readForm(formData);

  const db = getDb();
  await db.insert(contributions).values({ clerkId: userId, ...toColumns(parsed) });

  revalidateAll();
}

export async function updateContribution(id: string, formData: FormData) {
  // Rows are keyed by the household id, not the signed-in account's own id.
  const userId = await requireWriteClerkId();
  const parsed = readForm(formData);

  const db = getDb();
  await db
    .update(contributions)
    .set({ ...toColumns(parsed), updatedAt: new Date() })
    .where(and(eq(contributions.id, id), eq(contributions.clerkId, userId)));

  revalidateAll();
}

/**
 * Retire a contribution, or put it back in force.
 *
 * Leaving a job does not mean the past did not happen. Deleting the entry
 * would take last year's contributions out of every historical figure along
 * with the forecast, so it is marked ended instead and every forward-looking
 * calculation skips it.
 */
export async function setContributionActive(id: string, active: boolean) {
  const userId = await requireWriteClerkId();

  const db = getDb();
  await db
    .update(contributions)
    .set({
      isActive: active,
      endedOn: active ? null : new Date().toISOString().slice(0, 10),
      updatedAt: new Date(),
    })
    .where(and(eq(contributions.id, id), eq(contributions.clerkId, userId)));

  revalidateAll();
}

export async function deleteContribution(id: string) {
  // Rows are keyed by the household id, not the signed-in account's own id.
  const userId = await requireWriteClerkId();

  const db = getDb();
  await db
    .delete(contributions)
    .where(and(eq(contributions.id, id), eq(contributions.clerkId, userId)));

  revalidateAll();
}
