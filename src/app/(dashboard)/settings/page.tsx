import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { eq, and } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  userPreferences,
  socialSecurityBenefits,
  contributions,
} from "@/lib/db/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PreferencesForm } from "./preferences-form";
import { SocialSecurityForm } from "./social-security-form";
import { ContributionsSection } from "./contributions-section";
import { AiProviderSection } from "./ai-provider-section";

export default async function SettingsPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const db = getDb();
  const [prefs, selfSS, spouseSS, contributionsList] = await Promise.all([
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
          />
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
