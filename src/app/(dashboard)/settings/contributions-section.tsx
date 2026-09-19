"use client";

import { useState, useEffect, useActionState } from "react";
import { Plus, Trash2, Pencil, Wallet, Archive, RotateCcw } from "lucide-react";
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
  setContributionActive,
} from "@/lib/actions/contributions";
import {
  contributionBreakdown,
  partitionByActive,
  vestingStatus,
} from "@/lib/utils/contributions";
import { formatCurrency, formatPercent } from "@/lib/utils/format";
import type { Contribution } from "@/lib/types";

const FREQUENCY_LABELS: Record<string, string> = {
  per_paycheck_biweekly: "Per paycheck (biweekly, 26x/yr)",
  per_paycheck_semimonthly: "Per paycheck (semi-monthly, 24x/yr)",
  monthly: "Monthly",
  quarterly: "Quarterly",
  annually: "Annually",
};

/**
 * Annualize one entry. The arithmetic itself lives in lib/utils/contributions
 * so the figure shown here is the same one the projections use — this screen
 * and the forecast disagreeing is worse than either being wrong alone.
 */
function annualizeContribution(c: Contribution, salary: number | null) {
  const b = contributionBreakdown(c, salary ?? 0);
  return {
    yourAnnual: b.employee,
    matchAnnual: b.employerMatch,
    nonElectiveAnnual: b.employerNonElective,
    employerAnnual: b.employer,
  };
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
  limitAge60to63?: string;
  taxYear: number;
};

type Props = {
  contributions: Contribution[];
  selfSalary: number | null;
  spouseSalary: number | null;
  accounts?: AccountInfo[];
  selfAge?: number | null;
  spouseAge?: number | null;
};

export function ContributionsSection({
  contributions: items,
  selfSalary,
  spouseSalary,
  accounts = [],
  selfAge,
  spouseAge,
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

  // Get the current year's IRS limit for an account type + owner age tier
  const getIrsLimit = (accountType: string, ownerAge?: number | null): number | null => {
    const currentYear = new Date().getFullYear();
    const limit = irsLimits.find((l) => l.accountType === accountType && l.taxYear === currentYear)
      || irsLimits.find((l) => l.accountType === accountType && l.taxYear === currentYear + 1)
      || irsLimits.find((l) => l.accountType === accountType);
    if (!limit) return null;
    const age = ownerAge ?? 0;
    if (age >= 60 && age <= 63 && limit.limitAge60to63) return Number(limit.limitAge60to63);
    if (age >= 50) return Number(limit.limitOver50);
    return Number(limit.limitUnder50);
  };

  const getIrsLimitLabel = (ownerAge?: number | null): string => {
    const age = ownerAge ?? 0;
    if (age >= 60 && age <= 63) return "60-63 enhanced catch-up";
    if (age >= 50) return "50+ catch-up";
    return "under 50";
  };

  // Wrapper that resolves owner to age automatically
  const getIrsLimitForOwner = (accountType: string, owner: string): { limit: number | null; label: string } => {
    const age = owner === "spouse" ? spouseAge : selfAge;
    return { limit: getIrsLimit(accountType, age), label: getIrsLimitLabel(age) };
  };

  // Retired entries are listed separately and counted in no total — a 401(k)
  // from a job you left should not still be funding your retirement.
  const { active, archived } = partitionByActive(items);
  const selfItems = active.filter((c) => c.owner === "self");
  const spouseItems = active.filter((c) => c.owner === "spouse");

  let selfTotal = 0;
  let selfEmployerTotal = 0;
  let spouseTotal = 0;
  let spouseEmployerTotal = 0;

  for (const c of selfItems) {
    const { yourAnnual, employerAnnual } = annualizeContribution(c, selfSalary);
    selfTotal += yourAnnual;
    selfEmployerTotal += employerAnnual;
  }
  for (const c of spouseItems) {
    const { yourAnnual, employerAnnual } = annualizeContribution(c, spouseSalary);
    spouseTotal += yourAnnual;
    spouseEmployerTotal += employerAnnual;
  }

  const grandTotal =
    selfTotal + selfEmployerTotal + spouseTotal + spouseEmployerTotal;

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
              {selfEmployerTotal > 0 && (
                <p className="text-xs text-green-500">
                  + {formatCurrency(selfEmployerTotal)} employer
                </p>
              )}
            </div>
            <div>
              <p className="text-muted-foreground">Spouse contributions</p>
              <p className="font-mono font-semibold">
                {formatCurrency(spouseTotal)}/yr
              </p>
              {spouseEmployerTotal > 0 && (
                <p className="text-xs text-green-500">
                  + {formatCurrency(spouseEmployerTotal)} employer
                </p>
              )}
            </div>
            <div>
              <p className="text-muted-foreground">
                Household total (with employer)
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
        <div className="space-y-4">
          <div className="space-y-2">
            {active.map((c) => (
              <ContributionRow
                key={c.id}
                contribution={c}
                salary={c.owner === "self" ? selfSalary : spouseSalary}
                matchedAccountName={
                  accounts.find((a) =>
                    c.accountId
                      ? a.id === c.accountId
                      : a.owner === c.owner &&
                        a.accountType === c.accountType &&
                        a.isActivelyContributing
                  )?.name || null
                }
                accounts={accounts}
                getIrsLimitForOwner={getIrsLimitForOwner}
              />
            ))}
          </div>

          {archived.length > 0 && (
            <details className="rounded-lg border bg-muted/20">
              <summary className="cursor-pointer select-none px-3 py-2 text-sm text-muted-foreground">
                Retired ({archived.length}) — kept for history, excluded from
                every total and projection
              </summary>
              <div className="space-y-2 p-3 pt-0">
                {archived.map((c) => (
                  <ContributionRow
                    key={c.id}
                    contribution={c}
                    salary={c.owner === "self" ? selfSalary : spouseSalary}
                    matchedAccountName={null}
                    accounts={accounts}
                    getIrsLimitForOwner={getIrsLimitForOwner}
                  />
                ))}
              </div>
            </details>
          )}
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
          <AddContributionForm accounts={accounts} getIrsLimitForOwner={getIrsLimitForOwner} onSuccess={() => setAddOpen(false)} />
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ContributionRow({
  contribution: c,
  salary,
  matchedAccountName,
  accounts,
  getIrsLimitForOwner,
}: {
  contribution: Contribution;
  salary: number | null;
  matchedAccountName: string | null;
  accounts: AccountInfo[];
  getIrsLimitForOwner: (t: string, owner: string) => { limit: number | null; label: string };
}) {
  const [editOpen, setEditOpen] = useState(false);
  const { yourAnnual, matchAnnual, nonElectiveAnnual } = annualizeContribution(
    c,
    salary
  );
  const vesting = vestingStatus(c);

  const handleDelete = async () => {
    await deleteContribution(c.id);
  };

  return (
    <>
      <div
        className={
          "flex items-center justify-between rounded-lg border p-3" +
          (c.isActive ? "" : " opacity-60")
        }
      >
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
              {c.hasEmployerNonElective && (
                <span className="text-green-500 ml-2">
                  +{" "}
                  {Number(c.employerNonElectivePercent) > 0
                    ? `${Number(c.employerNonElectivePercent)}% employer, no match required`
                    : `${formatCurrency(Number(c.employerNonElectiveAmount))}/yr employer, no match required`}
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
            <div className="text-xs mt-0.5 flex flex-wrap items-center gap-x-2">
              {!c.isActive ? (
                <span className="text-muted-foreground">
                  Retired{c.endedOn ? ` ${c.endedOn}` : ""}
                </span>
              ) : matchedAccountName ? (
                <span className="text-primary">→ {matchedAccountName}</span>
              ) : (
                <span className="text-yellow-500">No matching account</span>
              )}
              {/* Vesting decides what you keep on the way out, not what the
                  account grows to, so it is shown as its own fact. */}
              {c.vestingSchedule !== "immediate" && (
                <span
                  className={
                    vesting.fraction >= 1
                      ? "text-muted-foreground"
                      : "text-yellow-500"
                  }
                >
                  {vesting.label}
                  {vesting.yearsRemaining !== null &&
                    ` · ${vesting.yearsRemaining.toFixed(1)} yr to 100%`}
                </span>
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
            {nonElectiveAnnual > 0 && (
              <p className="font-mono text-xs text-green-500">
                +{formatCurrency(nonElectiveAnnual)} employer
              </p>
            )}
          </div>
          <Button
            variant="ghost"
            size="icon"
            title={c.isActive ? "Retire this contribution" : "Put back in force"}
            onClick={() => setContributionActive(c.id, !c.isActive)}
          >
            {c.isActive ? (
              <Archive className="h-3.5 w-3.5 text-muted-foreground" />
            ) : (
              <RotateCcw className="h-3.5 w-3.5 text-muted-foreground" />
            )}
          </Button>
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
            getIrsLimitForOwner={getIrsLimitForOwner}
            onSuccess={() => setEditOpen(false)}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}

/**
 * Employer contributions and vesting, shared by the add and edit forms.
 *
 * One component rather than two near-identical blocks: the pair had already
 * drifted before this, and a field present on one form but not the other is
 * invisible until someone's numbers are quietly wrong.
 */
function EmployerFields({ c }: { c?: Contribution }) {
  const idp = c ? "edit" : "add";
  const [hasMatch, setHasMatch] = useState(c?.hasEmployerMatch ?? false);
  const [hasNonElective, setHasNonElective] = useState(
    c?.hasEmployerNonElective ?? false
  );
  const [vesting, setVesting] = useState<string>(c?.vestingSchedule ?? "immediate");

  return (
    <>
      <div className="space-y-3 rounded-lg border p-3">
        <div className="flex items-center gap-3">
          <Switch
            id={`${idp}HasMatch`}
            name="hasEmployerMatch"
            checked={hasMatch}
            onCheckedChange={setHasMatch}
          />
          <Label htmlFor={`${idp}HasMatch`} className="text-sm">
            Employer match
          </Label>
        </div>
        <p className="text-xs text-muted-foreground">
          Paid only against what you contribute. Stop contributing and it stops.
        </p>

        {hasMatch && (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-xs">Match rate</Label>
              <Input
                name="employerMatchRate"
                type="number"
                step="0.25"
                min="0"
                max="10"
                placeholder="1"
                defaultValue={c?.employerMatchRate || ""}
              />
              <p className="text-xs text-muted-foreground">
                1 = dollar-for-dollar, 0.5 = 50 cents per dollar
              </p>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Match up to (% of salary)</Label>
              <Input
                name="employerMatchMaxPercent"
                type="number"
                step="0.5"
                min="0"
                max="100"
                placeholder="5"
                defaultValue={c?.employerMatchMaxPercent || ""}
              />
            </div>
          </div>
        )}
      </div>

      <div className="space-y-3 rounded-lg border p-3">
        <div className="flex items-center gap-3">
          <Switch
            id={`${idp}HasNonElective`}
            name="hasEmployerNonElective"
            checked={hasNonElective}
            onCheckedChange={setHasNonElective}
          />
          <Label htmlFor={`${idp}HasNonElective`} className="text-sm">
            Employer contribution (no match required)
          </Label>
        </div>
        <p className="text-xs text-muted-foreground">
          Safe harbor or profit sharing — paid whether or not you contribute.
          Example: 2% of salary no matter what.
        </p>

        {hasNonElective && (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-xs">% of salary</Label>
              <Input
                name="employerNonElectivePercent"
                type="number"
                step="0.25"
                min="0"
                max="100"
                placeholder="2"
                defaultValue={c?.employerNonElectivePercent || ""}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">or flat amount ($/yr)</Label>
              <Input
                name="employerNonElectiveAmount"
                type="number"
                step="100"
                min="0"
                defaultValue={c?.employerNonElectiveAmount || ""}
              />
              <p className="text-xs text-muted-foreground">
                Used only when the percent is blank
              </p>
            </div>
          </div>
        )}
      </div>

      <div className="space-y-3 rounded-lg border p-3">
        <div className="space-y-1">
          <Label className="text-sm">Vesting on employer money</Label>
          <Select
            name="vestingSchedule"
            value={vesting}
            onValueChange={(v) => v && setVesting(v)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="immediate">Immediate — yours on day one</SelectItem>
              <SelectItem value="cliff">Cliff — 0% until the cliff, then 100%</SelectItem>
              <SelectItem value="graded">Graded — a bit more each year</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Affects what you keep if you leave, not what the account grows to.
            Projections are unchanged either way.
          </p>
        </div>

        {vesting !== "immediate" && (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-xs">Years to 100%</Label>
              <Input
                name="vestingYears"
                type="number"
                step="1"
                min="0"
                max="20"
                placeholder="3"
                defaultValue={c?.vestingYears ?? ""}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Service start date</Label>
              <Input
                name="serviceStartDate"
                type="date"
                defaultValue={c?.serviceStartDate ?? ""}
              />
            </div>
          </div>
        )}
      </div>
    </>
  );
}

function AddContributionForm({ accounts, getIrsLimitForOwner, onSuccess }: { accounts: AccountInfo[]; getIrsLimitForOwner: (t: string, owner: string) => { limit: number | null; label: string }; onSuccess: () => void }) {
  const [method, setMethod] = useState<"percent_of_salary" | "fixed_amount">(
    "percent_of_salary"
  );
  const [hasEscalation, setHasEscalation] = useState(false);
  const [selectedAccountId, setSelectedAccountId] = useState(accounts[0]?.id || "");

  const selectedAccount = accounts.find((a) => a.id === selectedAccountId);
  const { limit: irsMax, label: irsLabel } = selectedAccount
    ? getIrsLimitForOwner(selectedAccount.accountType, selectedAccount.owner)
    : { limit: null, label: "under 50" };

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

      <EmployerFields />

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
                  ? `Auto-filled from IRS ${new Date().getFullYear()} limit: ${formatCurrency(irsMax)} (${irsLabel}). Updates when IRS limits are refreshed.`
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
  getIrsLimitForOwner,
  onSuccess,
}: {
  contribution: Contribution;
  accounts: AccountInfo[];
  getIrsLimitForOwner: (t: string, owner: string) => { limit: number | null; label: string };
  onSuccess: () => void;
}) {
  const [method, setMethod] = useState<"percent_of_salary" | "fixed_amount">(
    c.contributionMethod as "percent_of_salary" | "fixed_amount"
  );
  const [hasEscalation, setHasEscalation] = useState(c.hasAnnualEscalation || false);
  const [selectedAccountId, setSelectedAccountId] = useState(c.accountId || accounts[0]?.id || "");

  const selectedAccount = accounts.find((a) => a.id === selectedAccountId);
  const { limit: irsMax, label: irsLabel } = selectedAccount
    ? getIrsLimitForOwner(selectedAccount.accountType, selectedAccount.owner)
    : { limit: null, label: "under 50" };

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

      <EmployerFields c={c} />

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
                  IRS limit: {formatCurrency(irsMax)} ({irsLabel})
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
