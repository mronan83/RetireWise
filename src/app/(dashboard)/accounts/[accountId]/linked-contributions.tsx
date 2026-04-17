"use client";

import { useState, useActionState } from "react";
import { Plus, Trash2, AlertCircle } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatCurrency } from "@/lib/utils/format";
import {
  createContribution,
  deleteContribution,
} from "@/lib/actions/contributions";
import type { Contribution, Account } from "@/lib/types";

const FREQUENCY_MULTIPLIER: Record<string, number> = {
  per_paycheck_biweekly: 26,
  per_paycheck_semimonthly: 24,
  monthly: 12,
  quarterly: 4,
  annually: 1,
};

const FREQUENCY_LABELS: Record<string, string> = {
  per_paycheck_biweekly: "biweekly",
  per_paycheck_semimonthly: "semi-monthly",
  monthly: "monthly",
  quarterly: "quarterly",
  annually: "annually",
};

type Props = {
  contributions: Contribution[];
  account: Account;
};

export function LinkedContributions({ contributions: contribs, account }: Props) {
  const [addOpen, setAddOpen] = useState(false);

  if (contribs.length === 0) {
    return (
      <div>
        {account.isActivelyContributing ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-yellow-500">
              <AlertCircle className="h-4 w-4" />
              <span className="text-sm font-medium">No contributions linked</span>
            </div>
            <p className="text-xs text-muted-foreground">
              This account is marked as actively contributing, but no contribution
              entries match it. The projections won&apos;t include new money for this account.
            </p>
            <Button size="sm" variant="outline" onClick={() => setAddOpen(true)}>
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              Add Contribution
            </Button>
          </div>
        ) : (
          <div>
            <p className="text-sm text-muted-foreground">
              No contributions (inactive account)
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              This is an old account that only grows with market returns.
            </p>
          </div>
        )}

        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Contribution for {account.name}</DialogTitle>
            </DialogHeader>
            <QuickAddContribution
              account={account}
              onSuccess={() => setAddOpen(false)}
            />
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {contribs.map((c) => {
        let annual = 0;
        if (c.contributionMethod === "percent_of_salary") {
          annual = Number(c.contributionPercent || 0); // just show % for now
        } else {
          annual =
            Number(c.contributionAmount || 0) *
            (FREQUENCY_MULTIPLIER[c.frequency] || 1);
        }

        return (
          <div key={c.id} className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">{c.label}</p>
              <p className="text-xs text-muted-foreground">
                {c.contributionMethod === "percent_of_salary" ? (
                  <>{Number(c.contributionPercent)}% of salary</>
                ) : (
                  <>
                    {formatCurrency(Number(c.contributionAmount))}{" "}
                    {FREQUENCY_LABELS[c.frequency]}
                  </>
                )}
                {c.hasEmployerMatch && (
                  <span className="text-green-500 ml-1">
                    + {Number(c.employerMatchRate)}:1 match up to{" "}
                    {Number(c.employerMatchMaxPercent)}%
                  </span>
                )}
              </p>
            </div>
            <button
              onClick={() => deleteContribution(c.id)}
              className="text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        );
      })}
      <div className="flex gap-2 mt-1">
        <Button size="sm" variant="ghost" onClick={() => setAddOpen(true)} className="text-xs h-7">
          <Plus className="mr-1 h-3 w-3" />
          Add another
        </Button>
        <Link href="/settings">
          <Button size="sm" variant="ghost" className="text-xs h-7">
            Manage in Settings
          </Button>
        </Link>
      </div>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Contribution for {account.name}</DialogTitle>
          </DialogHeader>
          <QuickAddContribution
            account={account}
            onSuccess={() => setAddOpen(false)}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}

function QuickAddContribution({
  account,
  onSuccess,
}: {
  account: Account;
  onSuccess: () => void;
}) {
  const [method, setMethod] = useState<"percent_of_salary" | "fixed_amount">(
    "percent_of_salary"
  );
  const [hasMatch, setHasMatch] = useState(false);

  const [error, formAction, isPending] = useActionState(
    async (_prev: string | null, formData: FormData) => {
      try {
        await createContribution(formData);
        onSuccess();
        return null;
      } catch (e) {
        return e instanceof Error ? e.message : "Failed";
      }
    },
    null
  );

  return (
    <form action={formAction} className="space-y-4">
      {/* Pre-fill owner and account type from the account */}
      <input type="hidden" name="owner" value={account.owner} />
      <input type="hidden" name="accountType" value={account.accountType} />

      {error && (
        <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="rounded-lg border bg-muted/30 p-3 text-sm">
        <p className="text-muted-foreground">
          This contribution will link to <strong>{account.name}</strong> in projections.
        </p>
      </div>

      <div className="space-y-1">
        <Label>Label</Label>
        <Input
          name="label"
          placeholder={`e.g. My ${account.name} contribution`}
          defaultValue={`${account.name} contribution`}
          required
        />
      </div>

      <div className="space-y-1">
        <Label>How do you contribute?</Label>
        <Select
          name="contributionMethod"
          defaultValue="percent_of_salary"
          onValueChange={(v) =>
            v && setMethod(v as "percent_of_salary" | "fixed_amount")
          }
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="percent_of_salary">% of salary</SelectItem>
            <SelectItem value="fixed_amount">Fixed dollar amount</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {method === "percent_of_salary" ? (
        <div className="space-y-1">
          <Label>Contribution (% of salary)</Label>
          <Input
            name="contributionPercent"
            type="number"
            step="0.5"
            min="0"
            max="100"
            placeholder="6"
            required
          />
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <Label>Amount ($)</Label>
            <Input
              name="contributionAmount"
              type="number"
              step="0.01"
              min="0"
              placeholder="500"
              required
            />
          </div>
          <div className="space-y-1">
            <Label>Frequency</Label>
            <Select name="frequency" defaultValue="per_paycheck_biweekly">
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(FREQUENCY_LABELS).map(([v, l]) => (
                  <SelectItem key={v} value={v}>
                    {l}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      )}

      {method === "percent_of_salary" && (
        <input type="hidden" name="frequency" value="per_paycheck_biweekly" />
      )}

      <div className="space-y-3 rounded-lg border p-3">
        <div className="flex items-center gap-3">
          <Switch
            id="qhasMatch"
            name="hasEmployerMatch"
            checked={hasMatch}
            onCheckedChange={setHasMatch}
          />
          <Label htmlFor="qhasMatch" className="text-sm">
            Employer match
          </Label>
        </div>
        {hasMatch && (
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label className="text-xs">Match rate</Label>
              <Input
                name="employerMatchRate"
                type="number"
                step="0.25"
                placeholder="1"
              />
              <p className="text-[10px] text-muted-foreground">
                1 = dollar-for-dollar
              </p>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Up to (% of salary)</Label>
              <Input
                name="employerMatchMaxPercent"
                type="number"
                step="0.5"
                placeholder="5"
              />
            </div>
          </div>
        )}
      </div>

      <Button type="submit" disabled={isPending} className="w-full">
        {isPending ? "Adding..." : "Add Contribution"}
      </Button>
    </form>
  );
}
