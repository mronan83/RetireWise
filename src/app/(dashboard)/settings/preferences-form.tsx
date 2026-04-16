"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DEFAULT_TARGET_ALLOCATION,
  ASSET_CLASS_LABELS,
  FILING_STATUS_LABELS,
} from "@/lib/constants";
import { updatePreferences } from "@/lib/actions/preferences";
import type { UserPreference } from "@/lib/types";

function HelpText({ children }: { children: React.ReactNode }) {
  return <p className="text-xs text-muted-foreground mt-1">{children}</p>;
}

type Props = {
  preferences: UserPreference | null;
};

export function PreferencesForm({ preferences }: Props) {
  const targetAllocation =
    (preferences?.targetAllocation as Record<string, number>) ||
    DEFAULT_TARGET_ALLOCATION;

  const [message, formAction, isPending] = useActionState(
    async (_prev: string | null, formData: FormData) => {
      try {
        await updatePreferences(formData);
        return "Preferences saved successfully.";
      } catch (e) {
        return e instanceof Error ? e.message : "Failed to save preferences";
      }
    },
    null
  );

  return (
    <form action={formAction} className="space-y-8">
      {message && (
        <div
          className={`rounded-md p-3 text-sm ${
            message.includes("success")
              ? "bg-green-500/10 text-green-500"
              : "bg-destructive/10 text-destructive"
          }`}
        >
          {message}
        </div>
      )}

      {/* Your Details */}
      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
          Your Details
        </h3>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-1">
            <Label htmlFor="firstName">First Name</Label>
            <Input
              id="firstName"
              name="firstName"
              defaultValue={preferences?.firstName || ""}
              placeholder="Matt"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="currentAge">Current Age</Label>
            <Input
              id="currentAge"
              name="currentAge"
              type="number"
              defaultValue={preferences?.currentAge || ""}
              placeholder="42"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="retirementAge">Target Retirement Age</Label>
            <Input
              id="retirementAge"
              name="retirementAge"
              type="number"
              defaultValue={preferences?.retirementAge || ""}
              placeholder="65"
            />
            <HelpText>The age you plan to stop working</HelpText>
          </div>
        </div>
      </div>

      {/* Spouse Details */}
      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
          Spouse Details
        </h3>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-1">
            <Label htmlFor="spouseName">Spouse Name</Label>
            <Input
              id="spouseName"
              name="spouseName"
              defaultValue={preferences?.spouseName || ""}
              placeholder="Name"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="spouseCurrentAge">Spouse Current Age</Label>
            <Input
              id="spouseCurrentAge"
              name="spouseCurrentAge"
              type="number"
              defaultValue={preferences?.spouseCurrentAge || ""}
              placeholder="40"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="spouseRetirementAge">Spouse Retirement Age</Label>
            <Input
              id="spouseRetirementAge"
              name="spouseRetirementAge"
              type="number"
              defaultValue={preferences?.spouseRetirementAge || ""}
              placeholder="65"
            />
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Switch
            id="spouseIsRetired"
            name="spouseIsRetired"
            defaultChecked={preferences?.spouseIsRetired || false}
          />
          <Label htmlFor="spouseIsRetired">Spouse is already retired</Label>
        </div>
      </div>

      {/* Income & Savings */}
      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
          Income & Savings
        </h3>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="annualSalary">Your Annual Salary ($)</Label>
            <Input
              id="annualSalary"
              name="annualSalary"
              type="number"
              step="1"
              defaultValue={preferences?.annualSalary || ""}
              placeholder="150000"
            />
            <HelpText>Your gross annual income before taxes</HelpText>
          </div>
          <div className="space-y-1">
            <Label htmlFor="spouseAnnualSalary">
              Spouse Annual Salary ($)
            </Label>
            <Input
              id="spouseAnnualSalary"
              name="spouseAnnualSalary"
              type="number"
              step="1"
              defaultValue={preferences?.spouseAnnualSalary || ""}
              placeholder="80000"
            />
            <HelpText>
              Spouse&apos;s gross annual income (0 if retired)
            </HelpText>
          </div>
        </div>

        <div className="space-y-1">
          <Label htmlFor="monthlyExpensesRetirement">
            Monthly Spending in Retirement ($)
          </Label>
          <Input
            id="monthlyExpensesRetirement"
            name="monthlyExpensesRetirement"
            type="number"
            step="500"
            defaultValue={preferences?.monthlyExpensesRetirement || ""}
            placeholder="7000"
          />
          <HelpText>
            Estimated monthly household expenses once both of you are retired
            (housing, food, healthcare, travel, etc.)
          </HelpText>
        </div>
        <p className="text-xs text-muted-foreground italic">
          Individual retirement contributions (401k, IRA, etc.) are managed in
          the Retirement Contributions section below.
        </p>
      </div>

      {/* Household Settings */}
      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
          Household Settings
        </h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="filingStatus">Tax Filing Status</Label>
            <Select
              name="filingStatus"
              defaultValue={
                preferences?.filingStatus || "married_filing_jointly"
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(FILING_STATUS_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <HelpText>
              How you file your federal taxes. Affects tax bracket calculations.
            </HelpText>
          </div>
          <div className="space-y-1">
            <Label htmlFor="riskTolerance">Risk Tolerance</Label>
            <Select
              name="riskTolerance"
              defaultValue={preferences?.riskTolerance || "moderate"}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="conservative">
                  Conservative (preserve capital)
                </SelectItem>
                <SelectItem value="moderate">
                  Moderate (balanced growth)
                </SelectItem>
                <SelectItem value="aggressive">
                  Aggressive (maximize growth)
                </SelectItem>
              </SelectContent>
            </Select>
            <HelpText>
              Guides allocation recommendations. Aggressive = more stocks, less
              bonds.
            </HelpText>
          </div>
        </div>
      </div>

      {/* Target Allocation */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
          Target Allocation (%)
        </h3>
        <p className="text-xs text-muted-foreground">
          Your ideal portfolio mix across the household. The AI will compare your
          actual allocation against these targets and suggest rebalancing when
          drift is significant.
        </p>
        <div className="grid gap-3 sm:grid-cols-3">
          {Object.entries(ASSET_CLASS_LABELS)
            .filter(([key]) => key in DEFAULT_TARGET_ALLOCATION)
            .map(([key, label]) => (
              <div key={key} className="space-y-1">
                <Label htmlFor={`target_${key}`} className="text-xs">
                  {label}
                </Label>
                <Input
                  id={`target_${key}`}
                  name={`target_${key}`}
                  type="number"
                  min="0"
                  max="100"
                  defaultValue={targetAllocation[key] || 0}
                />
              </div>
            ))}
        </div>
        <HelpText>Should sum to 100%.</HelpText>
      </div>

      <Button type="submit" disabled={isPending}>
        {isPending ? "Saving..." : "Save Preferences"}
      </Button>
    </form>
  );
}
