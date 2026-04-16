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
    <form action={formAction} className="space-y-6">
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

      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
          Your Details
        </h3>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="firstName">First Name</Label>
            <Input
              id="firstName"
              name="firstName"
              defaultValue={preferences?.firstName || ""}
              placeholder="Matt"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="currentAge">Current Age</Label>
            <Input
              id="currentAge"
              name="currentAge"
              type="number"
              defaultValue={preferences?.currentAge || ""}
              placeholder="35"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="retirementAge">Target Retirement Age</Label>
            <Input
              id="retirementAge"
              name="retirementAge"
              type="number"
              defaultValue={preferences?.retirementAge || ""}
              placeholder="65"
            />
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
          Spouse Details
        </h3>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="spouseName">Spouse Name</Label>
            <Input
              id="spouseName"
              name="spouseName"
              defaultValue={preferences?.spouseName || ""}
              placeholder="Name"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="spouseCurrentAge">Spouse Current Age</Label>
            <Input
              id="spouseCurrentAge"
              name="spouseCurrentAge"
              type="number"
              defaultValue={preferences?.spouseCurrentAge || ""}
              placeholder="33"
            />
          </div>
          <div className="space-y-2">
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
          <Label htmlFor="spouseIsRetired">
            Spouse is already retired
          </Label>
        </div>
      </div>

      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
          Household Finances
        </h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
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
          </div>
          <div className="space-y-2">
            <Label htmlFor="riskTolerance">Risk Tolerance</Label>
            <Select
              name="riskTolerance"
              defaultValue={preferences?.riskTolerance || "moderate"}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="conservative">Conservative</SelectItem>
                <SelectItem value="moderate">Moderate</SelectItem>
                <SelectItem value="aggressive">Aggressive</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="annualContribution">
              Your Annual Contribution ($)
            </Label>
            <Input
              id="annualContribution"
              name="annualContribution"
              type="number"
              step="100"
              defaultValue={preferences?.annualContribution || ""}
              placeholder="24000"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="spouseAnnualContribution">
              Spouse Annual Contribution ($)
            </Label>
            <Input
              id="spouseAnnualContribution"
              name="spouseAnnualContribution"
              type="number"
              step="100"
              defaultValue={preferences?.spouseAnnualContribution || ""}
              placeholder="20000"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="monthlyExpensesRetirement">
              Monthly Expenses in Retirement ($)
            </Label>
            <Input
              id="monthlyExpensesRetirement"
              name="monthlyExpensesRetirement"
              type="number"
              step="100"
              defaultValue={preferences?.monthlyExpensesRetirement || ""}
              placeholder="7000"
            />
          </div>
        </div>
      </div>

      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
          Target Allocation (%)
        </h3>
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
        <p className="text-xs text-muted-foreground">
          Household-level target. Percentages should sum to 100%.
        </p>
      </div>

      <Button type="submit" disabled={isPending}>
        {isPending ? "Saving..." : "Save Preferences"}
      </Button>
    </form>
  );
}
