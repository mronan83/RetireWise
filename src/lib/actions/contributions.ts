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
});

export async function createContribution(formData: FormData) {
  // Rows are keyed by the household id, not the signed-in account's own id.
  const userId = await requireWriteClerkId();

  const parsed = contributionSchema.parse({
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
    employerMatchMaxPercent:
      formData.get("employerMatchMaxPercent") || undefined,
  });

  const db = getDb();
  await db.insert(contributions).values({
    clerkId: userId,
    owner: parsed.owner,
    accountId: parsed.accountId || null,
    label: parsed.label,
    accountType: parsed.accountType,
    contributionMethod: parsed.contributionMethod,
    contributionPercent: parsed.contributionPercent
      ? String(parsed.contributionPercent)
      : null,
    contributionAmount: parsed.contributionAmount
      ? String(parsed.contributionAmount)
      : null,
    frequency: parsed.frequency,
    hasAnnualEscalation: parsed.hasAnnualEscalation || false,
    annualEscalationAmount: parsed.annualEscalationAmount
      ? String(parsed.annualEscalationAmount)
      : null,
    maxAnnualContribution: parsed.maxAnnualContribution
      ? String(parsed.maxAnnualContribution)
      : null,
    hasEmployerMatch: parsed.hasEmployerMatch || false,
    employerMatchRate: parsed.employerMatchRate
      ? String(parsed.employerMatchRate)
      : null,
    employerMatchMaxPercent: parsed.employerMatchMaxPercent
      ? String(parsed.employerMatchMaxPercent)
      : null,
  });

  revalidatePath("/settings");
}

export async function updateContribution(id: string, formData: FormData) {
  // Rows are keyed by the household id, not the signed-in account's own id.
  const userId = await requireWriteClerkId();

  const parsed = contributionSchema.parse({
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
  });

  const db = getDb();
  await db
    .update(contributions)
    .set({
      owner: parsed.owner,
      accountId: parsed.accountId || null,
      label: parsed.label,
      accountType: parsed.accountType,
      contributionMethod: parsed.contributionMethod,
      contributionPercent: parsed.contributionPercent ? String(parsed.contributionPercent) : null,
      contributionAmount: parsed.contributionAmount ? String(parsed.contributionAmount) : null,
      frequency: parsed.frequency,
      hasAnnualEscalation: parsed.hasAnnualEscalation || false,
      annualEscalationAmount: parsed.annualEscalationAmount ? String(parsed.annualEscalationAmount) : null,
      maxAnnualContribution: parsed.maxAnnualContribution ? String(parsed.maxAnnualContribution) : null,
      hasEmployerMatch: parsed.hasEmployerMatch || false,
      employerMatchRate: parsed.employerMatchRate ? String(parsed.employerMatchRate) : null,
      employerMatchMaxPercent: parsed.employerMatchMaxPercent ? String(parsed.employerMatchMaxPercent) : null,
      updatedAt: new Date(),
    })
    .where(and(eq(contributions.id, id), eq(contributions.clerkId, userId)));

  revalidatePath("/settings");
  revalidatePath("/accounts");
  revalidatePath("/projections");
}

export async function deleteContribution(id: string) {
  // Rows are keyed by the household id, not the signed-in account's own id.
  const userId = await requireWriteClerkId();

  const db = getDb();
  await db
    .delete(contributions)
    .where(and(eq(contributions.id, id), eq(contributions.clerkId, userId)));

  revalidatePath("/settings");
  revalidatePath("/accounts");
  revalidatePath("/projections");
}
