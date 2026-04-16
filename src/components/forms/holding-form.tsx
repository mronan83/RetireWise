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
import { ASSET_CLASS_LABELS } from "@/lib/constants";
import type { Account } from "@/lib/types";

type Props = {
  accounts: Account[];
  defaultAccountId?: string;
  holding?: {
    id: string;
    accountId: string;
    ticker: string;
    name: string;
    assetClass: string;
    shares: string;
    costBasisPerShare: string;
    currentPrice: string;
  };
  action: (formData: FormData) => Promise<void>;
  onSuccess?: () => void;
};

export function HoldingForm({
  accounts,
  defaultAccountId,
  holding,
  action,
  onSuccess,
}: Props) {
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
        <Label htmlFor="accountId">Account</Label>
        <Select
          name="accountId"
          defaultValue={holding?.accountId || defaultAccountId || accounts[0]?.id}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select an account" />
          </SelectTrigger>
          <SelectContent>
            {accounts.map((account) => (
              <SelectItem key={account.id} value={account.id}>
                {account.name} ({account.institution})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="ticker">Ticker</Label>
          <Input
            id="ticker"
            name="ticker"
            defaultValue={holding?.ticker}
            placeholder="e.g. VTI"
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="name">Name</Label>
          <Input
            id="name"
            name="name"
            defaultValue={holding?.name}
            placeholder="e.g. Vanguard Total Stock Market"
            required
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="assetClass">Asset Class</Label>
        <Select
          name="assetClass"
          defaultValue={holding?.assetClass || "us_stock"}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(ASSET_CLASS_LABELS).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="space-y-2">
          <Label htmlFor="shares">Shares</Label>
          <Input
            id="shares"
            name="shares"
            type="number"
            step="0.00000001"
            defaultValue={holding?.shares}
            placeholder="0"
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="costBasisPerShare">Cost Basis/Share</Label>
          <Input
            id="costBasisPerShare"
            name="costBasisPerShare"
            type="number"
            step="0.0001"
            defaultValue={holding?.costBasisPerShare}
            placeholder="0.00"
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="currentPrice">Current Price</Label>
          <Input
            id="currentPrice"
            name="currentPrice"
            type="number"
            step="0.0001"
            defaultValue={holding?.currentPrice}
            placeholder="0.00"
            required
          />
        </div>
      </div>

      <Button type="submit" disabled={isPending} className="w-full">
        {isPending
          ? "Saving..."
          : holding
            ? "Update Holding"
            : "Add Holding"}
      </Button>
    </form>
  );
}
