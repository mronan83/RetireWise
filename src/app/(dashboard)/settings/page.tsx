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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PreferencesForm } from "./preferences-form";
import { SocialSecurityForm } from "./social-security-form";
import { ContributionsSection } from "./contributions-section";
import { AiProviderSection } from "./ai-provider-section";
import { HouseholdSharing } from "./household-sharing";
import { IrsLimitsSection } from "./irs-limits-section";

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

      <Card>
        <CardHeader>
          <CardTitle>Household Sharing</CardTitle>
        </CardHeader>
        <CardContent>
          <HouseholdSharing household={householdData} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Household & Retirement Preferences</CardTitle>
        </CardHeader>
        <CardContent>
          <PreferencesForm preferences={currentPrefs} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Retirement Contributions</CardTitle>
        </CardHeader>
        <CardContent>
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
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>IRS Contribution Limits</CardTitle>
        </CardHeader>
        <CardContent>
          <IrsLimitsSection />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>AI Model</CardTitle>
        </CardHeader>
        <CardContent>
          <AiProviderSection
            currentProvider={currentPrefs?.aiProvider || "anthropic"}
          />
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              My Social Security
              <Badge variant="secondary" className="text-xs">
                Self
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <SocialSecurityForm
              owner="self"
              benefits={selfSS[0] || null}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              Spouse&apos;s Social Security
              <Badge className="text-xs">Spouse</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <SocialSecurityForm
              owner="spouse"
              benefits={spouseSS[0] || null}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
