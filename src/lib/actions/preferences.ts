"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "../db";
import { userPreferences } from "../db/schema";

const preferencesSchema = z.object({
  firstName: z.string().optional(),
  currentAge: z.coerce.number().int().min(18).max(100).optional(),
  retirementAge: z.coerce.number().int().min(30).max(100).optional(),
  riskTolerance: z.enum(["conservative", "moderate", "aggressive"]).optional(),
  filingStatus: z
    .enum(["married_filing_jointly", "married_filing_separately", "single"])
    .optional(),
  annualContribution: z.coerce.number().min(0).optional(),
  monthlyExpensesRetirement: z.coerce.number().min(0).optional(),

  // Spouse
  spouseName: z.string().optional(),
  spouseCurrentAge: z.coerce.number().int().min(18).max(100).optional(),
  spouseRetirementAge: z.coerce.number().int().min(30).max(100).optional(),
  spouseIsRetired: z.coerce.boolean().optional(),
  spouseAnnualContribution: z.coerce.number().min(0).optional(),
});

export async function updatePreferences(formData: FormData) {
  const { userId } = await auth();
  if (!userId) throw new Error("Unauthorized");

  const parsed = preferencesSchema.parse({
    firstName: formData.get("firstName") || undefined,
    currentAge: formData.get("currentAge") || undefined,
    retirementAge: formData.get("retirementAge") || undefined,
    riskTolerance: formData.get("riskTolerance") || undefined,
    filingStatus: formData.get("filingStatus") || undefined,
    annualContribution: formData.get("annualContribution") || undefined,
    monthlyExpensesRetirement:
      formData.get("monthlyExpensesRetirement") || undefined,
    spouseName: formData.get("spouseName") || undefined,
    spouseCurrentAge: formData.get("spouseCurrentAge") || undefined,
    spouseRetirementAge: formData.get("spouseRetirementAge") || undefined,
    spouseIsRetired: formData.get("spouseIsRetired") === "on" || false,
    spouseAnnualContribution:
      formData.get("spouseAnnualContribution") || undefined,
  });

  const targetAllocation = {
    us_stock: Number(formData.get("target_us_stock") || 50),
    intl_stock: Number(formData.get("target_intl_stock") || 20),
    bond: Number(formData.get("target_bond") || 20),
    reit: Number(formData.get("target_reit") || 5),
    cash: Number(formData.get("target_cash") || 5),
  };

  const db = getDb();
  const existing = await db
    .select({ id: userPreferences.id })
    .from(userPreferences)
    .where(eq(userPreferences.clerkId, userId))
    .limit(1);

  const data = {
    firstName: parsed.firstName || null,
    currentAge: parsed.currentAge || null,
    retirementAge: parsed.retirementAge || null,
    riskTolerance: parsed.riskTolerance || ("moderate" as const),
    filingStatus:
      parsed.filingStatus || ("married_filing_jointly" as const),
    annualContribution: parsed.annualContribution
      ? String(parsed.annualContribution)
      : null,
    monthlyExpensesRetirement: parsed.monthlyExpensesRetirement
      ? String(parsed.monthlyExpensesRetirement)
      : null,
    spouseName: parsed.spouseName || null,
    spouseCurrentAge: parsed.spouseCurrentAge || null,
    spouseRetirementAge: parsed.spouseRetirementAge || null,
    spouseIsRetired: parsed.spouseIsRetired || false,
    spouseAnnualContribution: parsed.spouseAnnualContribution
      ? String(parsed.spouseAnnualContribution)
      : null,
    targetAllocation,
    updatedAt: new Date(),
  };

  if (existing.length > 0) {
    await db
      .update(userPreferences)
      .set(data)
      .where(eq(userPreferences.clerkId, userId));
  } else {
    await db.insert(userPreferences).values({
      clerkId: userId,
      ...data,
    });
  }

  revalidatePath("/settings");
  revalidatePath("/dashboard");
}
