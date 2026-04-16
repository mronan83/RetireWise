"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { eq, and } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "../db";
import { contributions } from "../db/schema";

const contributionSchema = z.object({
  owner: z.enum(["self", "spouse"]),
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
  hasEmployerMatch: z.coerce.boolean().optional(),
  employerMatchRate: z.coerce.number().min(0).max(10).optional(),
  employerMatchMaxPercent: z.coerce.number().min(0).max(100).optional(),
});

export async function createContribution(formData: FormData) {
  const { userId } = await auth();
  if (!userId) throw new Error("Unauthorized");

  const parsed = contributionSchema.parse({
    owner: formData.get("owner"),
    label: formData.get("label"),
    accountType: formData.get("accountType"),
    contributionMethod: formData.get("contributionMethod"),
    contributionPercent: formData.get("contributionPercent") || undefined,
    contributionAmount: formData.get("contributionAmount") || undefined,
    frequency: formData.get("frequency"),
    hasEmployerMatch: formData.get("hasEmployerMatch") === "on",
    employerMatchRate: formData.get("employerMatchRate") || undefined,
    employerMatchMaxPercent:
      formData.get("employerMatchMaxPercent") || undefined,
  });

  const db = getDb();
  await db.insert(contributions).values({
    clerkId: userId,
    owner: parsed.owner,
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

export async function deleteContribution(id: string) {
  const { userId } = await auth();
  if (!userId) throw new Error("Unauthorized");

  const db = getDb();
  await db
    .delete(contributions)
    .where(and(eq(contributions.id, id), eq(contributions.clerkId, userId)));

  revalidatePath("/settings");
}
