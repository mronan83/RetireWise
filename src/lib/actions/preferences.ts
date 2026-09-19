"use server";

import { requireWriteClerkId } from "@/lib/auth-helpers";
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
  annualSalary: z.coerce.number().min(0).optional(),
  annualContribution: z.coerce.number().min(0).optional(),
  monthlyExpensesRetirement: z.coerce.number().min(0).optional(),

  // Spouse
  spouseName: z.string().optional(),
  spouseCurrentAge: z.coerce.number().int().min(18).max(100).optional(),
  spouseRetirementAge: z.coerce.number().int().min(30).max(100).optional(),
  spouseIsRetired: z.coerce.boolean().optional(),
  spouseAnnualSalary: z.coerce.number().min(0).optional(),
  spouseAnnualContribution: z.coerce.number().min(0).optional(),
});

export async function updatePreferences(formData: FormData) {
  // Rows are keyed by the household id, not the signed-in account's own id.
  const userId = await requireWriteClerkId();

  const parsed = preferencesSchema.parse({
    firstName: formData.get("firstName") || undefined,
    currentAge: formData.get("currentAge") || undefined,
    retirementAge: formData.get("retirementAge") || undefined,
    riskTolerance: formData.get("riskTolerance") || undefined,
    filingStatus: formData.get("filingStatus") || undefined,
    annualSalary: formData.get("annualSalary") || undefined,
    annualContribution: formData.get("annualContribution") || undefined,
    monthlyExpensesRetirement:
      formData.get("monthlyExpensesRetirement") || undefined,
    spouseName: formData.get("spouseName") || undefined,
    spouseCurrentAge: formData.get("spouseCurrentAge") || undefined,
    spouseRetirementAge: formData.get("spouseRetirementAge") || undefined,
    spouseIsRetired: formData.get("spouseIsRetired") === "on" || false,
    spouseAnnualSalary: formData.get("spouseAnnualSalary") || undefined,
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

  // Salary growth configs
  const salaryGrowthMethod = formData.get("salaryGrowthMethod") as string;
  const salaryGrowth = salaryGrowthMethod ? {
    method: salaryGrowthMethod,
    value: Number(formData.get("salaryGrowthValue") || 3),
    years: Number(formData.get("salaryGrowthYears") || 10),
    targetAmount: salaryGrowthMethod === "target_by_year" ? Number(formData.get("salaryGrowthValue") || 0) : undefined,
  } : null;

  const spouseSalaryGrowthMethod = formData.get("spouseSalaryGrowthMethod") as string;
  const spouseSalaryGrowth = spouseSalaryGrowthMethod ? {
    method: spouseSalaryGrowthMethod,
    value: Number(formData.get("spouseSalaryGrowthValue") || 3),
    years: Number(formData.get("spouseSalaryGrowthYears") || 10),
    targetAmount: spouseSalaryGrowthMethod === "target_by_year" ? Number(formData.get("spouseSalaryGrowthValue") || 0) : undefined,
  } : null;

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
    annualSalary: parsed.annualSalary ? String(parsed.annualSalary) : null,
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
    spouseAnnualSalary: parsed.spouseAnnualSalary
      ? String(parsed.spouseAnnualSalary)
      : null,
    spouseAnnualContribution: parsed.spouseAnnualContribution
      ? String(parsed.spouseAnnualContribution)
      : null,
    salaryGrowth,
    spouseSalaryGrowth,
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
