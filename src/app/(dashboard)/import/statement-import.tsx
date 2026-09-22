"use client";

import { useState } from "react";
import { AlertCircle, CheckCircle2, ArrowLeftRight, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatCurrency } from "@/lib/utils/format";
import { DEBT_TYPE_LABELS, CASH_TYPE_LABELS } from "@/lib/constants-net-worth";
import {
  suggestDebtType,
  suggestCashType,
  suggestName,
  type OfxStatement,
} from "@/lib/import/ofx";
import {
  importStatementBalance,
  type StatementImportResult,
} from "@/lib/actions/import-statement";

export type ExistingAccount = {
  id: string;
  name: string;
  balance: number;
  linked: boolean;
};

type Props = {
  statements: OfxStatement[];
  debts: ExistingAccount[];
  cash: ExistingAccount[];
};

const KIND_LABEL: Record<string, string> = {
  credit_card: "Credit card",
  line_of_credit: "Line of credit",
  loan: "Loan",
  checking: "Checking",
  savings: "Savings",
  money_market: "Money market",
  cd: "CD",
  other_cash: "Cash account",
};

/**
 * Confirm what an OFX statement says before any of it is written.
 *
 * Every field here starts filled in from the file and every one can be
 * changed, because the two things this screen exists to settle cannot be
 * settled by the parser alone: whether a balance is money owed or money held,
 * and whether this statement is a new account or one already tracked.
 *
 * Getting either wrong is not a cosmetic error. A card filed as cash moves
 * net worth by twice the balance, in the flattering direction.
 */
export function StatementImport({ statements, debts, cash }: Props) {
  return (
    <div className="space-y-4">
      {statements.map((s, i) => (
        <StatementCard key={i} statement={s} debts={debts} cash={cash} />
      ))}
    </div>
  );
}

function StatementCard({
  statement,
  debts,
  cash,
}: {
  statement: OfxStatement;
  debts: ExistingAccount[];
  cash: ExistingAccount[];
}) {
  const [target, setTarget] = useState<"debt" | "cash">(
    statement.target === "cash" ? "cash" : "debt"
  );
  const [name, setName] = useState(suggestName(statement));
  const [owner, setOwner] = useState<"self" | "spouse">("self");
  const [debtType, setDebtType] = useState(suggestDebtType(statement.kind));
  const [cashType, setCashType] = useState(suggestCashType(statement.kind));
  const [existingId, setExistingId] = useState<string>("new");
  const [flipped, setFlipped] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<StatementImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reading = statement.balance;
  const balance = reading ? (flipped ? -reading.value : reading.value) : 0;
  const options = target === "debt" ? debts : cash;

  async function run(force: boolean) {
    setBusy(true);
    setError(null);
    try {
      const r = await importStatementBalance({
        target,
        existingId: existingId === "new" ? null : existingId,
        name,
        owner,
        balance,
        asOf: statement.balance?.asOf ?? null,
        debtType: target === "debt" ? debtType : undefined,
        cashType: target === "cash" ? cashType : undefined,
        institution: statement.institution,
        accountTail: statement.accountTail,
        force,
      });
      setResult(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed");
    } finally {
      setBusy(false);
    }
  }

  if (!reading) {
    return (
      <Card data-testid="statement-card">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">
            {KIND_LABEL[statement.kind] ?? statement.kind}
            {statement.accountTail ? ` ····${statement.accountTail}` : ""}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            This statement has transactions but no balance in it, so there is
            nothing to import. Enter the balance on the Net Worth page instead.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (result?.status === "created" || result?.status === "updated") {
    return (
      <Card data-testid="statement-card">
        <CardContent className="flex items-start gap-2 pt-6 text-sm text-green-500">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          <span data-testid="import-success">
            {result.status === "created"
              ? `Added ${result.name} at ${formatCurrency(result.balance)}.`
              : `Updated ${result.name}: ${formatCurrency(result.was)} → ${formatCurrency(result.now)}.`}
          </span>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card data-testid="statement-card" data-kind={statement.kind} data-target={target}>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle className="text-base">
            {KIND_LABEL[statement.kind] ?? statement.kind}
            {statement.accountTail ? ` ····${statement.accountTail}` : ""}
          </CardTitle>
          <Badge variant="secondary" className="text-xs">
            {target === "debt" ? "Debt" : "Cash"}
          </Badge>
        </div>
        {/* Why the file was filed here, quoted from the file, so the routing
            can be checked rather than trusted. */}
        <p className="text-xs text-muted-foreground">
          Detected from {statement.kindFrom}
        </p>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* ---- the number, and how its sign was settled ---- */}
        <div className="rounded-md border p-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="text-xs text-muted-foreground">
              {target === "debt" ? "Balance owed" : "Balance held"}
              {statement.balance?.asOf ? ` as of ${statement.balance.asOf}` : ""}
            </span>
            <span
              className="font-mono text-xl font-bold"
              data-testid="statement-balance"
            >
              {formatCurrency(balance)}
            </span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            File reads <span className="font-mono">{reading.raw}</span> —{" "}
            {reading.convention}.
          </p>
          {reading.confidence === "assumed" && (
            <p className="mt-2 flex items-start gap-1.5 text-xs text-amber-500">
              <Info className="mt-0.5 h-3 w-3 shrink-0" />
              Nothing in this file settles which way round the balance is
              written. Check it against your statement before importing.
            </p>
          )}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="mt-2 h-7 px-2 text-xs"
            data-testid="flip-sign"
            onClick={() => setFlipped((f) => !f)}
          >
            <ArrowLeftRight className="mr-1 h-3 w-3" />
            That&apos;s the wrong way round
          </Button>
          {statement.available !== null && (
            <p className="mt-1 text-xs text-muted-foreground">
              Available: {formatCurrency(statement.available)}
            </p>
          )}
        </div>

        {/* ---- where it goes ---- */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Record as</Label>
            <Select
              value={target}
              onValueChange={(v) => v && setTarget(v as "debt" | "cash")}
            >
              <SelectTrigger data-testid="statement-target">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="debt">A debt</SelectItem>
                <SelectItem value="cash">A cash account</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Type</Label>
            {target === "debt" ? (
              <Select
                value={debtType}
                onValueChange={(v) => v && setDebtType(v as typeof debtType)}
              >
                <SelectTrigger data-testid="statement-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(DEBT_TYPE_LABELS).map(([v, label]) => (
                    <SelectItem key={v} value={v}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Select
                value={cashType}
                onValueChange={(v) => v && setCashType(v as typeof cashType)}
              >
                <SelectTrigger data-testid="statement-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(CASH_TYPE_LABELS).map(([v, label]) => (
                    <SelectItem key={v} value={v}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor={`name-${statement.accountTail ?? "x"}`}>Name</Label>
            <Input
              id={`name-${statement.accountTail ?? "x"}`}
              value={name}
              onChange={(e) => setName(e.target.value)}
              data-testid="statement-name"
            />
          </div>

          <div className="space-y-2">
            <Label>Owner</Label>
            <Select value={owner} onValueChange={(v) => v && setOwner(v as "self" | "spouse")}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="self">Self</SelectItem>
                <SelectItem value="spouse">Spouse</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2 sm:col-span-2">
            <Label>Apply to</Label>
            <Select value={existingId} onValueChange={(v) => v && setExistingId(v)}>
              <SelectTrigger data-testid="statement-existing">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="new">Add as a new account</SelectItem>
                {options.map((o) => (
                  <SelectItem key={o.id} value={o.id}>
                    {o.name} — {formatCurrency(o.balance)}
                    {o.linked ? " (bank-linked)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* ---- refusals, each with the way past it ---- */}
        {result?.status === "stale" && (
          <Refusal
            onForce={() => run(true)}
            busy={busy}
            label="Import it anyway"
            text={`This statement is dated ${result.statementDate}, but a newer balance of ${formatCurrency(
              result.currentBalance
            )} was recorded on ${result.recordedOn}. Importing it would move the balance backwards, which a payoff goal would read as new borrowing.`}
          />
        )}
        {result?.status === "linked" && (
          <Refusal
            onForce={() => run(true)}
            busy={busy}
            label="Overwrite until the next sync"
            text={`${result.name} is kept current by a bank connection. Anything written here is replaced the next time it syncs.`}
          />
        )}
        {result?.status === "credit_balance" && (
          <div className="flex items-start gap-2 rounded-md bg-amber-500/10 p-3 text-sm text-amber-600 dark:text-amber-400">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              This card is overpaid by {formatCurrency(result.amount)} — that is
              money the issuer owes you, not a debt. Record it as a cash account,
              or use the flip button above if the sign is wrong.
            </span>
          </div>
        )}
        {error && (
          <div className="flex items-center gap-2 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
            <AlertCircle className="h-4 w-4" />
            {error}
          </div>
        )}

        <Button onClick={() => run(false)} disabled={busy} data-testid="statement-import">
          {busy ? "Importing..." : "Import this balance"}
        </Button>
      </CardContent>
    </Card>
  );
}

function Refusal({
  text,
  label,
  onForce,
  busy,
}: {
  text: string;
  label: string;
  onForce: () => void;
  busy: boolean;
}) {
  return (
    <div className="space-y-2 rounded-md bg-amber-500/10 p-3 text-sm text-amber-600 dark:text-amber-400">
      <div className="flex items-start gap-2">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
        <span>{text}</span>
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={onForce}
        disabled={busy}
        data-testid="statement-force"
      >
        {label}
      </Button>
    </div>
  );
}
