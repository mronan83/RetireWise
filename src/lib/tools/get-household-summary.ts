import { tool } from "ai";
import { z } from "zod";
import { auth } from "@clerk/nextjs/server";
import { eq, and } from "drizzle-orm";
import { getDb } from "../db";
import {
  userPreferences,
  socialSecurityBenefits,
  accounts,
} from "../db/schema";
import { getHoldingsByClerkId } from "../queries/holdings";
import { ACCOUNT_OWNER_LABELS, ACCOUNT_TYPE_LABELS } from "../constants";

export const getHouseholdSummaryTool = tool({
  description:
    "Get household financial summary including both spouses' retirement details, Social Security benefits, account breakdown by owner, and retirement timeline.",
  inputSchema: z.object({}),
  execute: async () => {
    const { userId } = await auth();
    if (!userId) return { error: "Not authenticated" };

    const db = getDb();
    const [prefs, selfSS, spouseSS, allAccounts, holdings] =
      await Promise.all([
        db
          .select()
          .from(userPreferences)
          .where(eq(userPreferences.clerkId, userId))
          .limit(1),
        db
          .select()
          .from(socialSecurityBenefits)
          .where(
            and(
              eq(socialSecurityBenefits.clerkId, userId),
              eq(socialSecurityBenefits.owner, "self")
            )
          )
          .limit(1),
        db
          .select()
          .from(socialSecurityBenefits)
          .where(
            and(
              eq(socialSecurityBenefits.clerkId, userId),
              eq(socialSecurityBenefits.owner, "spouse")
            )
          )
          .limit(1),
        db
          .select()
          .from(accounts)
          .where(eq(accounts.clerkId, userId)),
        getHoldingsByClerkId(userId),
      ]);

    const pref = prefs[0];

    // Per-owner totals
    let selfTotal = 0;
    let spouseTotal = 0;
    for (const h of holdings) {
      const val = Number(h.currentValue);
      if (h.accountOwner === "spouse") {
        spouseTotal += val;
      } else {
        selfTotal += val;
      }
    }

    // Accounts by owner
    const selfAccounts = allAccounts
      .filter((a) => a.owner === "self")
      .map((a) => ({
        name: a.name,
        type: ACCOUNT_TYPE_LABELS[a.accountType] || a.accountType,
        institution: a.institution,
      }));
    const spouseAccounts = allAccounts
      .filter((a) => a.owner === "spouse")
      .map((a) => ({
        name: a.name,
        type: ACCOUNT_TYPE_LABELS[a.accountType] || a.accountType,
        institution: a.institution,
      }));

    // Social Security
    const selfSSData = selfSS[0];
    const spouseSSData = spouseSS[0];

    return {
      household: {
        totalPortfolioValue: Math.round((selfTotal + spouseTotal) * 100) / 100,
        selfPortfolioValue: Math.round(selfTotal * 100) / 100,
        spousePortfolioValue: Math.round(spouseTotal * 100) / 100,
        filingStatus: pref?.filingStatus || "married_filing_jointly",
        monthlyExpensesRetirement: pref?.monthlyExpensesRetirement
          ? Number(pref.monthlyExpensesRetirement)
          : null,
      },
      self: {
        name: pref?.firstName || "Self",
        currentAge: pref?.currentAge,
        retirementAge: pref?.retirementAge,
        yearsToRetirement:
          pref?.currentAge && pref?.retirementAge
            ? pref.retirementAge - pref.currentAge
            : null,
        annualContribution: pref?.annualContribution
          ? Number(pref.annualContribution)
          : null,
        accounts: selfAccounts,
        socialSecurity: selfSSData
          ? {
              benefitAtAge62: selfSSData.benefitAtAge62
                ? Number(selfSSData.benefitAtAge62)
                : null,
              benefitAtFRA: selfSSData.benefitAtFRA
                ? Number(selfSSData.benefitAtFRA)
                : null,
              benefitAtAge70: selfSSData.benefitAtAge70
                ? Number(selfSSData.benefitAtAge70)
                : null,
              fullRetirementAge: selfSSData.fullRetirementAge,
              plannedClaimingAge: selfSSData.plannedClaimingAge,
              isClaiming: selfSSData.isClaiming,
              currentMonthlyBenefit: selfSSData.currentMonthlyBenefit
                ? Number(selfSSData.currentMonthlyBenefit)
                : null,
            }
          : null,
      },
      spouse: {
        name: pref?.spouseName || "Spouse",
        currentAge: pref?.spouseCurrentAge,
        retirementAge: pref?.spouseRetirementAge,
        isRetired: pref?.spouseIsRetired,
        yearsToRetirement:
          pref?.spouseCurrentAge && pref?.spouseRetirementAge
            ? Math.max(0, pref.spouseRetirementAge - pref.spouseCurrentAge)
            : null,
        annualContribution: pref?.spouseAnnualContribution
          ? Number(pref.spouseAnnualContribution)
          : null,
        accounts: spouseAccounts,
        socialSecurity: spouseSSData
          ? {
              benefitAtAge62: spouseSSData.benefitAtAge62
                ? Number(spouseSSData.benefitAtAge62)
                : null,
              benefitAtFRA: spouseSSData.benefitAtFRA
                ? Number(spouseSSData.benefitAtFRA)
                : null,
              benefitAtAge70: spouseSSData.benefitAtAge70
                ? Number(spouseSSData.benefitAtAge70)
                : null,
              fullRetirementAge: spouseSSData.fullRetirementAge,
              plannedClaimingAge: spouseSSData.plannedClaimingAge,
              isClaiming: spouseSSData.isClaiming,
              currentMonthlyBenefit: spouseSSData.currentMonthlyBenefit
                ? Number(spouseSSData.currentMonthlyBenefit)
                : null,
            }
          : null,
      },
    };
  },
});
