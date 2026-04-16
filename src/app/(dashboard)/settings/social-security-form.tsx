"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { updateSocialSecurity } from "@/lib/actions/social-security";
import type { SocialSecurityBenefit } from "@/lib/types";

type Props = {
  owner: "self" | "spouse";
  benefits: SocialSecurityBenefit | null;
};

export function SocialSecurityForm({ owner, benefits }: Props) {
  const [message, formAction, isPending] = useActionState(
    async (_prev: string | null, formData: FormData) => {
      try {
        await updateSocialSecurity(formData);
        return "Social Security info saved.";
      } catch (e) {
        return e instanceof Error ? e.message : "Failed to save";
      }
    },
    null
  );

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="owner" value={owner} />

      {message && (
        <div
          className={`rounded-md p-3 text-sm ${
            message.includes("saved")
              ? "bg-green-500/10 text-green-500"
              : "bg-destructive/10 text-destructive"
          }`}
        >
          {message}
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Find your estimated benefits at{" "}
        <a
          href="https://www.ssa.gov/myaccount/"
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium underline"
        >
          ssa.gov/myaccount
        </a>
      </p>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1">
          <Label htmlFor={`${owner}_benefitAtAge62`} className="text-xs">
            Monthly at Age 62
          </Label>
          <Input
            id={`${owner}_benefitAtAge62`}
            name="benefitAtAge62"
            type="number"
            step="1"
            defaultValue={benefits?.benefitAtAge62 || ""}
            placeholder="1800"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`${owner}_benefitAtFRA`} className="text-xs">
            Monthly at FRA
          </Label>
          <Input
            id={`${owner}_benefitAtFRA`}
            name="benefitAtFRA"
            type="number"
            step="1"
            defaultValue={benefits?.benefitAtFRA || ""}
            placeholder="2800"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`${owner}_benefitAtAge70`} className="text-xs">
            Monthly at Age 70
          </Label>
          <Input
            id={`${owner}_benefitAtAge70`}
            name="benefitAtAge70"
            type="number"
            step="1"
            defaultValue={benefits?.benefitAtAge70 || ""}
            placeholder="3500"
          />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor={`${owner}_fullRetirementAge`} className="text-xs">
            Full Retirement Age (FRA)
          </Label>
          <Input
            id={`${owner}_fullRetirementAge`}
            name="fullRetirementAge"
            type="number"
            min="62"
            max="70"
            defaultValue={benefits?.fullRetirementAge || ""}
            placeholder="67"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`${owner}_plannedClaimingAge`} className="text-xs">
            Planned Claiming Age
          </Label>
          <Input
            id={`${owner}_plannedClaimingAge`}
            name="plannedClaimingAge"
            type="number"
            min="62"
            max="70"
            defaultValue={benefits?.plannedClaimingAge || ""}
            placeholder="67"
          />
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <Switch
            id={`${owner}_isClaiming`}
            name="isClaiming"
            defaultChecked={benefits?.isClaiming || false}
          />
          <Label htmlFor={`${owner}_isClaiming`} className="text-sm">
            Already claiming benefits
          </Label>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label
              htmlFor={`${owner}_currentMonthlyBenefit`}
              className="text-xs"
            >
              Current Monthly Benefit ($)
            </Label>
            <Input
              id={`${owner}_currentMonthlyBenefit`}
              name="currentMonthlyBenefit"
              type="number"
              step="1"
              defaultValue={benefits?.currentMonthlyBenefit || ""}
              placeholder="0"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor={`${owner}_claimingStartDate`} className="text-xs">
              Claiming Start Date
            </Label>
            <Input
              id={`${owner}_claimingStartDate`}
              name="claimingStartDate"
              type="date"
              defaultValue={benefits?.claimingStartDate || ""}
            />
          </div>
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <Switch
            id={`${owner}_eligibleForSpousalBenefit`}
            name="eligibleForSpousalBenefit"
            defaultChecked={benefits?.eligibleForSpousalBenefit || false}
          />
          <Label
            htmlFor={`${owner}_eligibleForSpousalBenefit`}
            className="text-sm"
          >
            Eligible for spousal benefit
          </Label>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label
              htmlFor={`${owner}_spousalBenefitAmount`}
              className="text-xs"
            >
              Spousal Benefit Amount ($)
            </Label>
            <Input
              id={`${owner}_spousalBenefitAmount`}
              name="spousalBenefitAmount"
              type="number"
              step="1"
              defaultValue={benefits?.spousalBenefitAmount || ""}
              placeholder="0"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor={`${owner}_assumedCOLAPct`} className="text-xs">
              Assumed Annual COLA (%)
            </Label>
            <Input
              id={`${owner}_assumedCOLAPct`}
              name="assumedCOLAPct"
              type="number"
              step="0.1"
              min="0"
              max="10"
              defaultValue={benefits?.assumedCOLAPct || "2.5"}
              placeholder="2.5"
            />
          </div>
        </div>
      </div>

      <Button type="submit" disabled={isPending} className="w-full">
        {isPending ? "Saving..." : "Save Social Security Info"}
      </Button>
    </form>
  );
}
