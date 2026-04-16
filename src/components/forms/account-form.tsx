"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
} from "@/lib/constants";
import type { Account } from "@/lib/types";

type Props = {
  account?: Account;
  action: (formData: FormData) => Promise<void>;
  onSuccess?: () => void;
};

export function AccountForm({ account, action, onSuccess }: Props) {
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

  return (
    <form action={formAction} className="space-y-4">
      {error && (
        <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="owner">Account Owner</Label>
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
          placeholder="e.g. Fidelity 401k"
          required
        />
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
          defaultValue={account?.taxTreatment || "taxable"}
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
