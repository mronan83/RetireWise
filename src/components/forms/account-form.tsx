"use client";

import { useState, useActionState } from "react";
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
  ACCOUNT_TYPE_LABELS,
  TAX_TREATMENT_LABELS,
  ACCOUNT_OWNER_LABELS,
  ACCOUNT_TYPE_DEFAULT_TAX,
} from "@/lib/constants";
import type { Account } from "@/lib/types";

type Props = {
  account?: Account;
  action: (formData: FormData) => Promise<void>;
  onSuccess?: () => void;
};

export function AccountForm({ account, action, onSuccess }: Props) {
  const [taxTreatment, setTaxTreatment] = useState<string>(
    account?.taxTreatment || "taxable"
  );

  const [error, formAction, isPending] = useActionState(
    async (_prev: string | null, formData: FormData) => {
      try {
        await action(formData);
        onSuccess?.();
        return null;
      } catch (e) {
        return e instanceof Error ? e.message : "Something went wrong";
      }
    },
    null
  );

  const handleAccountTypeChange = (type: string | null) => {
    if (!type) return;
    const defaultTax = ACCOUNT_TYPE_DEFAULT_TAX[type];
    if (defaultTax) {
      setTaxTreatment(defaultTax);
    }
  };

  return (
    <form action={formAction} className="space-y-4">
      {error && (
        <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="owner">Whose account is this?</Label>
        <Select name="owner" defaultValue={account?.owner || "self"}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(ACCOUNT_OWNER_LABELS).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="name">Account Name</Label>
        <Input
          id="name"
          name="name"
          defaultValue={account?.name}
          placeholder="e.g. Fidelity 401(k)"
          required
        />
        <p className="text-xs text-muted-foreground">
          A friendly name to identify this account
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="institution">Institution</Label>
        <Input
          id="institution"
          name="institution"
          defaultValue={account?.institution}
          placeholder="e.g. Fidelity"
          required
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="accountType">Account Type</Label>
        <Select
          name="accountType"
          defaultValue={account?.accountType || "brokerage"}
          onValueChange={handleAccountTypeChange}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(ACCOUNT_TYPE_LABELS).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="taxTreatment">Tax Treatment</Label>
        <Select
          name="taxTreatment"
          value={taxTreatment}
          onValueChange={(v) => v && setTaxTreatment(v)}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(TAX_TREATMENT_LABELS).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          Auto-set based on account type. Override if needed (e.g. Roth
          401k should be Tax-Free).
        </p>
      </div>

      <div className="flex items-center gap-3 rounded-lg border p-3">
        <Switch
          id="isActivelyContributing"
          name="isActivelyContributing"
          defaultChecked={account?.isActivelyContributing ?? true}
        />
        <div>
          <Label htmlFor="isActivelyContributing" className="text-sm">
            Actively contributing
          </Label>
          <p className="text-xs text-muted-foreground">
            Turn off for old employer accounts (e.g. prior 401k). The account
            still grows with the market but won&apos;t receive new contributions
            in projections.
          </p>
        </div>
      </div>

      <Button type="submit" disabled={isPending} className="w-full">
        {isPending
          ? "Saving..."
          : account
            ? "Update Account"
            : "Create Account"}
      </Button>
    </form>
  );
}
