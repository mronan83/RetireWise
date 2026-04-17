"use client";

import { useState, useEffect, useActionState } from "react";
import { Plus, Trash2, Pencil, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
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
import {
  ACCOUNT_TYPE_LABELS,
  ACCOUNT_OWNER_LABELS,
} from "@/lib/constants";
import {
  createContribution,
  updateContribution,
  deleteContribution,
} from "@/lib/actions/contributions";
import { formatCurrency, formatPercent } from "@/lib/utils/format";
import type { Contribution } from "@/lib/types";

const FREQUENCY_LABELS: Record<string, string> = {
  per_paycheck_biweekly: "Per paycheck (biweekly, 26x/yr)",
  per_paycheck_semimonthly: "Per paycheck (semi-monthly, 24x/yr)",
  monthly: "Monthly",
  quarterly: "Quarterly",
  annually: "Annually",
};

const FREQUENCY_MULTIPLIER: Record<string, number> = {
  per_paycheck_biweekly: 26,
  per_paycheck_semimonthly: 24,
  monthly: 12,
  quarterly: 4,
  annually: 1,
};

function annualizeContribution(
  c: Contribution,
  salary: number | null
): { yourAnnual: number; matchAnnual: number } {
  let yourAnnual = 0;

  if (c.contributionMethod === "percent_of_salary" && salary) {
    yourAnnual = (Number(c.contributionPercent || 0) / 100) * salary;
  } else if (c.contributionMethod === "fixed_amount") {
    const amount = Number(c.contributionAmount || 0);
    const multiplier = FREQUENCY_MULTIPLIER[c.frequency] || 1;
    yourAnnual = amount * multiplier;
  }

  let matchAnnual = 0;
  if (c.hasEmployerMatch && salary) {
    const matchRate = Number(c.employerMatchRate || 0);
    const matchMaxPct = Number(c.employerMatchMaxPercent || 0);
    const yourPct =
      c.contributionMethod === "percent_of_salary"
        ? Number(c.contributionPercent || 0)
        : salary > 0
          ? (yourAnnual / salary) * 100
          : 0;
    const matchablePct = Math.min(yourPct, matchMaxPct);
    matchAnnual = (matchablePct / 100) * salary * matchRate;
  }

  return { yourAnnual, matchAnnual };
}

type AccountInfo = {
  id: string;
  name: string;
  owner: string;
  accountType: string;
  isActivelyContributing: boolean;
};

type IrsLimit = {
  accountType: string;
  limitUnder50: string;
  limitOver50: string;
  taxYear: number;
};

type Props = {
  contributions: Contribution[];
  selfSalary: number | null;
  spouseSalary: number | null;
  accounts?: AccountInfo[];
};

export function ContributionsSection({
  contributions: items,
  selfSalary,
  spouseSalary,
  accounts = [],
}: Props) {
  const [addOpen, setAddOpen] = useState(false);
  const [irsLimits, setIrsLimits] = useState<IrsLimit[]>([]);

  // Fetch IRS limits on mount
  useEffect(() => {
    fetch("/api/irs-limits/refresh")
      .then((r) => r.json())
      .then((data) => setIrsLimits(data.limits || []))
      .catch(() => {});
  }, []);

  // Get the current year's IRS limit for an account type
  const getIrsLimit = (accountType: string): number | null => {
    const currentYear = new Date().getFullYear();
    // Try current year, then next year, then previous year
    const limit = irsLimits.find((l) => l.accountType === accountType && l.taxYear === currentYear)
      || irsLimits.find((l) => l.accountType === accountType && l.taxYear === currentYear + 1)
      || irsLimits.find((l) => l.accountType === accountType);
    return limit ? Number(limit.limitUnder50) : null;
  };

  const selfItems = items.filter((c) => c.owner === "self");
  const spouseItems = items.filter((c) => c.owner === "spouse");

  // Totals
  let selfTotal = 0;
  let selfMatchTotal = 0;
  let spouseTotal = 0;
  let spouseMatchTotal = 0;

  for (const c of selfItems) {
    const { yourAnnual, matchAnnual } = annualizeContribution(c, selfSalary);
    selfTotal += yourAnnual;
    selfMatchTotal += matchAnnual;
  }
  for (const c of spouseItems) {
    const { yourAnnual, matchAnnual } = annualizeContribution(c, spouseSalary);
    spouseTotal += yourAnnual;
    spouseMatchTotal += matchAnnual;
  }

  const grandTotal = selfTotal + selfMatchTotal + spouseTotal + spouseMatchTotal;

  return (
    <div className="space-y-4">
      {/* Summary */}
      {items.length > 0 && (
        <div className="rounded-lg border bg-muted/30 p-4">
          <div className="grid gap-3 sm:grid-cols-3 text-sm">
            <div>
              <p className="text-muted-foreground">Your contributions</p>
              <p className="font-mono font-semibold">
                {formatCurrency(selfTotal)}/yr
              </p>
              {selfMatchTotal > 0 && (
                <p className="text-xs text-green-500">
                  + {formatCurrency(selfMatchTotal)} employer match
                </p>
              )}
            </div>
            <div>
              <p className="text-muted-foreground">Spouse contributions</p>
              <p className="font-mono font-semibold">
                {formatCurrency(spouseTotal)}/yr
              </p>
              {spouseMatchTotal > 0 && (
                <p className="text-xs text-green-500">
                  + {formatCurrency(spouseMatchTotal)} employer match
                </p>
              )}
            </div>
            <div>
              <p className="text-muted-foreground">
                Household total (with match)
              </p>
              <p className="font-mono font-semibold text-lg">
                {formatCurrency(grandTotal)}/yr
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Line items */}
      {items.length === 0 ? (
        <div className="rounded-lg border border-dashed p-6 text-center">
          <Wallet className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            No contributions set up yet. Add your 401(k), IRA, and other
            retirement contributions.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((c) => {
            const salary =
              c.owner === "self" ? selfSalary : spouseSalary;
            const { yourAnnual, matchAnnual } = annualizeContribution(
              c,
              salary
            );
            // Find matched account
            const matchedAccount = accounts.find(
              (a) => c.accountId ? a.id === c.accountId : (a.owner === c.owner && a.accountType === c.accountType && a.isActivelyContributing)
            );
            return (
              <ContributionRow
                key={c.id}
                contribution={c}
                yourAnnual={yourAnnual}
                matchAnnual={matchAnnual}
                matchedAccountName={matchedAccount?.name || null}
                accounts={accounts}
                getIrsLimit={getIrsLimit}
              />
            );
          })}
        </div>
      )}

      {/* Add button */}
      <Button variant="outline" onClick={() => setAddOpen(true)}>
        <Plus className="mr-2 h-4 w-4" />
        Add Contribution
      </Button>

      {/* Add dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Add Contribution</DialogTitle>
          </DialogHeader>
          <AddContributionForm accounts={accounts} getIrsLimit={getIrsLimit} onSuccess={() => setAddOpen(false)} />
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ContributionRow({
  contribution: c,
  yourAnnual,
  matchAnnual,
  matchedAccountName,
  accounts,
  getIrsLimit,
}: {
  contribution: Contribution;
  yourAnnual: number;
  matchAnnual: number;
  matchedAccountName: string | null;
  accounts: AccountInfo[];
  getIrsLimit: (accountType: string) => number | null;
}) {
  const [editOpen, setEditOpen] = useState(false);

  const handleDelete = async () => {
    await deleteContribution(c.id);
  };

  return (
    <>
      <div className="flex items-center justify-between rounded-lg border p-3">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-medium text-sm">{c.label}</span>
              <Badge variant={c.owner === "spouse" ? "default" : "secondary"} className="text-xs">
                {ACCOUNT_OWNER_LABELS[c.owner]}
              </Badge>
              <Badge variant="outline" className="text-xs">
                {ACCOUNT_TYPE_LABELS[c.accountType]}
              </Badge>
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">
              {c.contributionMethod === "percent_of_salary" ? (
                <span>{Number(c.contributionPercent)}% of salary</span>
              ) : (
                <span>
                  {formatCurrency(Number(c.contributionAmount))}{" "}
                  {FREQUENCY_LABELS[c.frequency]?.toLowerCase()}
                </span>
              )}
              {c.hasEmployerMatch && (
                <span className="text-green-500 ml-2">
                  + {Number(c.employerMatchRate)}:1 match up to{" "}
                  {Number(c.employerMatchMaxPercent)}%
                </span>
              )}
              {c.hasAnnualEscalation && (
                <span className="text-blue-500 ml-2">
                  +{Number(c.annualEscalationAmount)}
                  {c.contributionMethod === "percent_of_salary" ? "%" : "/yr"}
                  {c.maxAnnualContribution && (
                    <> cap {formatCurrency(Number(c.maxAnnualContribution))}</>
                  )}
                </span>
              )}
            </div>
            <div className="text-xs mt-0.5">
              {matchedAccountName ? (
                <span className="text-primary">→ {matchedAccountName}</span>
              ) : (
                <span className="text-yellow-500">No matching account</span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <div className="text-right">
            <p className="font-mono text-sm font-medium">
              {formatCurrency(yourAnnual)}/yr
            </p>
            {matchAnnual > 0 && (
              <p className="font-mono text-xs text-green-500">
                +{formatCurrency(matchAnnual)} match
              </p>
            )}
          </div>
          <Button variant="ghost" size="icon" onClick={() => setEditOpen(true)}>
            <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
          </Button>
          <Button variant="ghost" size="icon" onClick={handleDelete}>
            <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
          </Button>
        </div>
      </div>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Contribution</DialogTitle>
          </DialogHeader>
          <EditContributionForm
            contribution={c}
            accounts={accounts}
            getIrsLimit={getIrsLimit}
            onSuccess={() => setEditOpen(false)}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}

function AddContributionForm({ accounts, getIrsLimit, onSuccess }: { accounts: AccountInfo[]; getIrsLimit: (t: string) => number | null; onSuccess: () => void }) {
  const [method, setMethod] = useState<"percent_of_salary" | "fixed_amount">(
    "percent_of_salary"
  );
  const [hasMatch, setHasMatch] = useState(false);
  const [hasEscalation, setHasEscalation] = useState(false);
  const [selectedAccountId, setSelectedAccountId] = useState(accounts[0]?.id || "");

  const selectedAccount = accounts.find((a) => a.id === selectedAccountId);
  const irsMax = selectedAccount ? getIrsLimit(selectedAccount.accountType) : null;

  const [error, formAction, isPending] = useActionState(
    async (_prev: string | null, formData: FormData) => {
      try {
        await createContribution(formData);
        onSuccess();
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

      {/* Hidden fields auto-filled from selected account */}
      <input type="hidden" name="owner" value={selectedAccount?.owner || "self"} />
      <input type="hidden" name="accountType" value={selectedAccount?.accountType || "401k"} />
      <input type="hidden" name="accountId" value={selectedAccountId} />

      <div className="space-y-1">
        <Label>Which account?</Label>
        <Select
          value={selectedAccountId}
          onValueChange={(v) => v && setSelectedAccountId(v)}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select an account" />
          </SelectTrigger>
          <SelectContent>
            {accounts.filter((a) => a.isActivelyContributing).map((a) => (
              <SelectItem key={a.id} value={a.id}>
                {a.name} ({ACCOUNT_TYPE_LABELS[a.accountType]}) — {ACCOUNT_OWNER_LABELS[a.owner]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          Only actively contributing accounts are shown
        </p>
      </div>

      {/* Keep account type selector as hidden fallback - removed visible one */}
      <div className="space-y-1">
        <Label htmlFor="label">Label</Label>
        <Input
          id="label"
          name="label"
          placeholder="e.g. My Fidelity 401(k)"
          required
        />
        <p className="text-xs text-muted-foreground">
          A name to identify this contribution
        </p>
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
            <SelectItem value="percent_of_salary">
              Percentage of salary
            </SelectItem>
            <SelectItem value="fixed_amount">Fixed dollar amount</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {method === "percent_of_salary" ? (
        <div className="space-y-1">
          <Label htmlFor="contributionPercent">
            Contribution (% of salary)
          </Label>
          <Input
            id="contributionPercent"
            name="contributionPercent"
            type="number"
            step="0.5"
            min="0"
            max="100"
            placeholder="6"
            required
          />
          <p className="text-xs text-muted-foreground">
            The percentage of your gross salary you contribute each pay period
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="contributionAmount">Amount ($)</Label>
            <Input
              id="contributionAmount"
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
                {Object.entries(FREQUENCY_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      )}

      {/* Hidden frequency for percent method */}
      {method === "percent_of_salary" && (
        <input type="hidden" name="frequency" value="per_paycheck_biweekly" />
      )}

      <div className="space-y-3 rounded-lg border p-3">
        <div className="flex items-center gap-3">
          <Switch
            id="hasEmployerMatch"
            name="hasEmployerMatch"
            checked={hasMatch}
            onCheckedChange={setHasMatch}
          />
          <Label htmlFor="hasEmployerMatch" className="text-sm">
            Employer match
          </Label>
        </div>

        {hasMatch && (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="employerMatchRate" className="text-xs">
                Match rate
              </Label>
              <Input
                id="employerMatchRate"
                name="employerMatchRate"
                type="number"
                step="0.25"
                min="0"
                max="10"
                placeholder="1"
              />
              <p className="text-xs text-muted-foreground">
                1 = dollar-for-dollar, 0.5 = 50 cents per dollar
              </p>
            </div>
            <div className="space-y-1">
              <Label htmlFor="employerMatchMaxPercent" className="text-xs">
                Match up to (% of salary)
              </Label>
              <Input
                id="employerMatchMaxPercent"
                name="employerMatchMaxPercent"
                type="number"
                step="0.5"
                min="0"
                max="100"
                placeholder="5"
              />
              <p className="text-xs text-muted-foreground">
                Employer matches your contributions up to this % of salary
              </p>
            </div>
          </div>
        )}
      </div>

      <div className="space-y-3 rounded-lg border p-3">
        <div className="flex items-center gap-3">
          <Switch
            id="hasAnnualEscalation"
            name="hasAnnualEscalation"
            checked={hasEscalation}
            onCheckedChange={setHasEscalation}
          />
          <Label htmlFor="hasAnnualEscalation" className="text-sm">
            Annual auto-increase
          </Label>
        </div>

        {hasEscalation && (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="annualEscalationAmount" className="text-xs">
                {method === "percent_of_salary"
                  ? "Increase per year (% points)"
                  : "Increase per year ($)"}
              </Label>
              <Input
                id="annualEscalationAmount"
                name="annualEscalationAmount"
                type="number"
                step="0.5"
                min="0"
                placeholder={method === "percent_of_salary" ? "1" : "500"}
              />
              <p className="text-xs text-muted-foreground">
                {method === "percent_of_salary"
                  ? "e.g., 1 = increase from 6% to 7% next year"
                  : "e.g., 500 = increase by $500/yr"}
              </p>
            </div>
            <div className="space-y-1">
              <Label htmlFor="maxAnnualContribution" className="text-xs">
                Max annual contribution ($)
              </Label>
              <Input
                id="maxAnnualContribution"
                name="maxAnnualContribution"
                type="number"
                step="100"
                min="0"
                key={irsMax || "default"}
                defaultValue={irsMax || ""}
                placeholder={irsMax ? String(irsMax) : "23500"}
              />
              <p className="text-xs text-muted-foreground">
                {irsMax
                  ? `Auto-filled from IRS ${new Date().getFullYear()} limit: ${formatCurrency(irsMax)} (under 50). Updates when IRS limits are refreshed.`
                  : "Set the IRS annual limit. Refresh IRS limits in Settings to auto-fill."}
              </p>
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

function EditContributionForm({
  contribution: c,
  accounts,
  getIrsLimit,
  onSuccess,
}: {
  contribution: Contribution;
  accounts: AccountInfo[];
  getIrsLimit: (t: string) => number | null;
  onSuccess: () => void;
}) {
  const [method, setMethod] = useState<"percent_of_salary" | "fixed_amount">(
    c.contributionMethod as "percent_of_salary" | "fixed_amount"
  );
  const [hasMatch, setHasMatch] = useState(c.hasEmployerMatch || false);
  const [hasEscalation, setHasEscalation] = useState(c.hasAnnualEscalation || false);
  const [selectedAccountId, setSelectedAccountId] = useState(c.accountId || accounts[0]?.id || "");

  const selectedAccount = accounts.find((a) => a.id === selectedAccountId);
  const irsMax = selectedAccount ? getIrsLimit(selectedAccount.accountType) : null;

  const [error, formAction, isPending] = useActionState(
    async (_prev: string | null, formData: FormData) => {
      try {
        await updateContribution(c.id, formData);
        onSuccess();
        return null;
      } catch (e) {
        return e instanceof Error ? e.message : "Something went wrong";
      }
    },
    null
  );

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="owner" value={selectedAccount?.owner || c.owner} />
      <input type="hidden" name="accountType" value={selectedAccount?.accountType || c.accountType} />
      <input type="hidden" name="accountId" value={selectedAccountId} />

      {error && (
        <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
      )}

      <div className="space-y-1">
        <Label>Account</Label>
        <Select value={selectedAccountId} onValueChange={(v) => v && setSelectedAccountId(v)}>
          <SelectTrigger><SelectValue placeholder="Select account" /></SelectTrigger>
          <SelectContent>
            {accounts.filter((a) => a.isActivelyContributing).map((a) => (
              <SelectItem key={a.id} value={a.id}>
                {a.name} ({ACCOUNT_TYPE_LABELS[a.accountType]}) — {ACCOUNT_OWNER_LABELS[a.owner]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1">
        <Label>Label</Label>
        <Input name="label" defaultValue={c.label} required />
      </div>

      <div className="space-y-1">
        <Label>Method</Label>
        <Select name="contributionMethod" defaultValue={c.contributionMethod} onValueChange={(v) => v && setMethod(v as "percent_of_salary" | "fixed_amount")}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="percent_of_salary">% of salary</SelectItem>
            <SelectItem value="fixed_amount">Fixed amount</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {method === "percent_of_salary" ? (
        <div className="space-y-1">
          <Label>Contribution (% of salary)</Label>
          <Input name="contributionPercent" type="number" step="0.5" defaultValue={c.contributionPercent || ""} required />
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <Label>Amount ($)</Label>
            <Input name="contributionAmount" type="number" step="0.01" defaultValue={c.contributionAmount || ""} required />
          </div>
          <div className="space-y-1">
            <Label>Frequency</Label>
            <Select name="frequency" defaultValue={c.frequency}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(FREQUENCY_LABELS).map(([v, l]) => (
                  <SelectItem key={v} value={v}>{l}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      )}
      {method === "percent_of_salary" && (
        <input type="hidden" name="frequency" value={c.frequency || "per_paycheck_biweekly"} />
      )}

      <div className="space-y-3 rounded-lg border p-3">
        <div className="flex items-center gap-3">
          <Switch id="editHasMatch" name="hasEmployerMatch" checked={hasMatch} onCheckedChange={setHasMatch} />
          <Label htmlFor="editHasMatch" className="text-sm">Employer match</Label>
        </div>
        {hasMatch && (
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label className="text-xs">Match rate</Label>
              <Input name="employerMatchRate" type="number" step="0.25" defaultValue={c.employerMatchRate || ""} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Up to (% of salary)</Label>
              <Input name="employerMatchMaxPercent" type="number" step="0.5" defaultValue={c.employerMatchMaxPercent || ""} />
            </div>
          </div>
        )}
      </div>

      <div className="space-y-3 rounded-lg border p-3">
        <div className="flex items-center gap-3">
          <Switch id="editHasEsc" name="hasAnnualEscalation" checked={hasEscalation} onCheckedChange={setHasEscalation} />
          <Label htmlFor="editHasEsc" className="text-sm">Annual auto-increase</Label>
        </div>
        {hasEscalation && (
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label className="text-xs">{method === "percent_of_salary" ? "Increase/yr (% pts)" : "Increase/yr ($)"}</Label>
              <Input name="annualEscalationAmount" type="number" step="0.5" defaultValue={c.annualEscalationAmount || ""} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Max annual ($)</Label>
              <Input name="maxAnnualContribution" type="number" step="100"
                defaultValue={c.maxAnnualContribution || irsMax || ""} />
              {irsMax && (
                <p className="text-[10px] text-muted-foreground">
                  IRS limit: {formatCurrency(irsMax)} (under 50)
                </p>
              )}
            </div>
          </div>
        )}
      </div>

      <Button type="submit" disabled={isPending} className="w-full">
        {isPending ? "Saving..." : "Save Changes"}
      </Button>
    </form>
  );
}
