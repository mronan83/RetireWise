"use server";

import { requireWriteClerkId } from "@/lib/auth-helpers";
import { revalidatePath } from "next/cache";
import { eq, and } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "../db";
import { socialSecurityBenefits } from "../db/schema";

const ssSchema = z.object({
  owner: z.enum(["self", "spouse"]),
  benefitAtAge62: z.coerce.number().min(0).optional(),
  benefitAtFRA: z.coerce.number().min(0).optional(),
  benefitAtAge70: z.coerce.number().min(0).optional(),
  fullRetirementAge: z.coerce.number().int().min(62).max(70).optional(),
  plannedClaimingAge: z.coerce.number().int().min(62).max(70).optional(),
  isClaiming: z.coerce.boolean().optional(),
  currentMonthlyBenefit: z.coerce.number().min(0).optional(),
  claimingStartDate: z.string().optional(),
  eligibleForSpousalBenefit: z.coerce.boolean().optional(),
  spousalBenefitAmount: z.coerce.number().min(0).optional(),
  assumedCOLAPct: z.coerce.number().min(0).max(10).optional(),
});

export async function updateSocialSecurity(formData: FormData) {
  // Rows are keyed by the household id, not the signed-in account's own id.
  const userId = await requireWriteClerkId();

  const parsed = ssSchema.parse({
    owner: formData.get("owner"),
    benefitAtAge62: formData.get("benefitAtAge62") || undefined,
    benefitAtFRA: formData.get("benefitAtFRA") || undefined,
    benefitAtAge70: formData.get("benefitAtAge70") || undefined,
    fullRetirementAge: formData.get("fullRetirementAge") || undefined,
    plannedClaimingAge: formData.get("plannedClaimingAge") || undefined,
    isClaiming: formData.get("isClaiming") === "on" || false,
    currentMonthlyBenefit: formData.get("currentMonthlyBenefit") || undefined,
    claimingStartDate: formData.get("claimingStartDate") || undefined,
    eligibleForSpousalBenefit:
      formData.get("eligibleForSpousalBenefit") === "on" || false,
    spousalBenefitAmount: formData.get("spousalBenefitAmount") || undefined,
    assumedCOLAPct: formData.get("assumedCOLAPct") || undefined,
  });

  const db = getDb();
  const existing = await db
    .select({ id: socialSecurityBenefits.id })
    .from(socialSecurityBenefits)
    .where(
      and(
        eq(socialSecurityBenefits.clerkId, userId),
        eq(socialSecurityBenefits.owner, parsed.owner)
      )
    )
    .limit(1);

  const data = {
    benefitAtAge62: parsed.benefitAtAge62
      ? String(parsed.benefitAtAge62)
      : null,
    benefitAtFRA: parsed.benefitAtFRA ? String(parsed.benefitAtFRA) : null,
    benefitAtAge70: parsed.benefitAtAge70
      ? String(parsed.benefitAtAge70)
      : null,
    fullRetirementAge: parsed.fullRetirementAge || null,
    plannedClaimingAge: parsed.plannedClaimingAge || null,
    isClaiming: parsed.isClaiming || false,
    currentMonthlyBenefit: parsed.currentMonthlyBenefit
      ? String(parsed.currentMonthlyBenefit)
      : null,
    claimingStartDate: parsed.claimingStartDate || null,
    eligibleForSpousalBenefit: parsed.eligibleForSpousalBenefit || false,
    spousalBenefitAmount: parsed.spousalBenefitAmount
      ? String(parsed.spousalBenefitAmount)
      : null,
    assumedCOLAPct: parsed.assumedCOLAPct
      ? String(parsed.assumedCOLAPct)
      : "2.5",
    updatedAt: new Date(),
  };

  if (existing.length > 0) {
    await db
      .update(socialSecurityBenefits)
      .set(data)
      .where(eq(socialSecurityBenefits.id, existing[0].id));
  } else {
    await db.insert(socialSecurityBenefits).values({
      clerkId: userId,
      owner: parsed.owner,
      ...data,
    });
  }

  revalidatePath("/settings");
  revalidatePath("/dashboard");
}
