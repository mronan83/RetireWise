import { getAuthContext } from "@/lib/auth-helpers";
import { eq, and } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { getAccounts } from "@/lib/queries/accounts";
import {
  userPreferences,
  socialSecurityBenefits,
  contributions,
  households,
  householdMembers,
} from "@/lib/db/schema";
import { CollapsibleSection } from "@/components/ui/collapsible-section";
import { PreferencesForm } from "./preferences-form";
import { SocialSecurityForm } from "./social-security-form";
import { ContributionsSection } from "./contributions-section";
import { AiProviderSection } from "./ai-provider-section";
import { HouseholdSharing } from "./household-sharing";
import { IrsLimitsSection } from "./irs-limits-section";
import { PlanSection } from "./plan-section";

export default async function SettingsPage() {
  const { dataClerkId: userId } = await getAuthContext();

  const db = getDb();
  const [prefs, selfSS, spouseSS, contributionsList, householdData, accountsList] = await Promise.all([
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
      .from(contributions)
      .where(eq(contributions.clerkId, userId))
      .orderBy(contributions.createdAt),
    // Get household info
    (async () => {
      const membership = await db
        .select({
          householdId: householdMembers.householdId,
          inviteCode: households.inviteCode,
          primaryClerkId: households.primaryClerkId,
        })
        .from(householdMembers)
        .innerJoin(households, eq(householdMembers.householdId, households.id))
        .where(eq(householdMembers.clerkId, userId))
        .limit(1);

      if (membership.length === 0) return null;

      const members = await db
        .select({
          clerkId: householdMembers.clerkId,
          role: householdMembers.role,
          joinedAt: householdMembers.joinedAt,
        })
        .from(householdMembers)
        .where(eq(householdMembers.householdId, membership[0].householdId));

      return {
        id: membership[0].householdId,
        inviteCode: membership[0].inviteCode,
        members,
      };
    })(),
    getAccounts(userId),
  ]);

  const currentPrefs = prefs[0] || null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground">
          Household preferences, retirement contributions, and Social Security
        </p>
      </div>

      <CollapsibleSection
        title="Household Sharing"
        summary={householdData ? "Shared household" : "Not shared"}
      >
        <HouseholdSharing household={householdData} />
      </CollapsibleSection>

      <CollapsibleSection
        title="Household & Retirement Preferences"
        summary={
          currentPrefs?.currentAge
            ? `Retire at ${currentPrefs.retirementAge} · ${currentPrefs.riskTolerance ?? "moderate"} risk`
            : "Age, retirement target, risk, salary"
        }
      >
        <PreferencesForm preferences={currentPrefs} />
      </CollapsibleSection>

      <CollapsibleSection
        title="Retirement Contributions"
        summary={`${contributionsList.filter((c) => c.isActive).length} active`}
        defaultOpen
      >
        <div>
          <p className="text-sm text-muted-foreground mb-4">
            Track what you and your spouse contribute to retirement accounts.
            Include employer matches to see the full picture.
          </p>
          <ContributionsSection
            contributions={contributionsList}
            selfSalary={
              currentPrefs?.annualSalary
                ? Number(currentPrefs.annualSalary)
                : null
            }
            spouseSalary={
              currentPrefs?.spouseAnnualSalary
                ? Number(currentPrefs.spouseAnnualSalary)
                : null
            }
            accounts={accountsList.map((a) => ({
              id: a.id,
              name: a.name,
              owner: a.owner,
              accountType: a.accountType,
              isActivelyContributing: a.isActivelyContributing,
            }))}
            selfAge={currentPrefs?.currentAge}
            spouseAge={currentPrefs?.spouseCurrentAge}
          />
        </div>
      </CollapsibleSection>

      <CollapsibleSection
        title="IRS Contribution Limits"
        summary="Reference figures for the current tax year"
      >
        <IrsLimitsSection />
      </CollapsibleSection>

      <CollapsibleSection
        title="Plan & Billing"
        summary="Friends & Family — every feature, free"
      >
        <PlanSection />
      </CollapsibleSection>

      <CollapsibleSection
        title="AI Model"
        summary={currentPrefs?.aiProvider || "anthropic"}
      >
        <AiProviderSection
          currentProvider={currentPrefs?.aiProvider || "anthropic"}
        />
      </CollapsibleSection>

      <div className="grid gap-6 lg:grid-cols-2">
        <CollapsibleSection
          title="Your Social Security"
          summary={selfSS[0]?.benefitAtFRA ? `$${Math.round(Number(selfSS[0].benefitAtFRA)).toLocaleString()}/mo at FRA` : "Not set"}
        >
          <SocialSecurityForm owner="self" benefits={selfSS[0] || null} />
        </CollapsibleSection>

        <CollapsibleSection
          title="Spouse's Social Security"
          summary={spouseSS[0]?.benefitAtFRA ? `$${Math.round(Number(spouseSS[0].benefitAtFRA)).toLocaleString()}/mo at FRA` : "Not set"}
        >
          <SocialSecurityForm owner="spouse" benefits={spouseSS[0] || null} />
        </CollapsibleSection>
      </div>
    </div>
  );
}
