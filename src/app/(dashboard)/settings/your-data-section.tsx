"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Download, Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Summary = { table: string; rows: number };

const CONFIRMATION = "DELETE MY DATA";

const LABELS: Record<string, string> = {
  accounts: "Accounts",
  holdings: "Holdings",
  transactions: "Transactions",
  contributions: "Contributions",
  goals: "Goals",
  alerts: "Alerts",
  aiAnalyses: "Saved AI analyses",
  cashReserves: "Cash accounts",
  debts: "Debts",
  realEstate: "Property",
  vehicles: "Vehicles",
  socialSecurityBenefits: "Social Security estimates",
  accountSnapshots: "Account history",
  portfolioSnapshots: "Portfolio history",
  netWorthSnapshots: "Net worth history",
  netWorthItemHistory: "Net worth item history",
  plaidItems: "Linked institutions",
  preferences: "Preferences",
  subscription: "Plan",
  auditLog: "Activity record",
  householdInvites: "Invitations",
};

export function YourDataSection() {
  const [summary, setSummary] = useState<Summary[] | null>(null);
  const [canDelete, setCanDelete] = useState(false);
  const [totalRows, setTotalRows] = useState(0);
  const [confirming, setConfirming] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: "ok" | "error"; text: string } | null>(null);

  useEffect(() => {
    fetch("/api/account/delete")
      .then((r) => r.json())
      .then((d) => {
        if (d.error) return;
        setSummary(d.summary ?? []);
        setCanDelete(Boolean(d.canDelete));
        setTotalRows(d.totalRows ?? 0);
      })
      .catch(() => {});
  }, []);

  const handleDelete = async () => {
    setBusy("delete");
    setMessage(null);
    try {
      const res = await fetch("/api/account/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: typed }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setMessage({
        type: "ok",
        text: `${data.totalRows} record${data.totalRows === 1 ? "" : "s"} erased. ${data.note}`,
      });
      setConfirming(false);
      setTyped("");
      setSummary([]);
      setTotalRows(0);
    } catch (e) {
      setMessage({
        type: "error",
        text: e instanceof Error && e.message ? e.message : "Deletion failed.",
      });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <div>
          <p className="font-medium">Download everything</p>
          <p className="text-sm text-muted-foreground">
            One file with every record held for your household. Your Plaid access tokens
            and AI provider key are deliberately left out — the file says which exist
            rather than including them.
          </p>
        </div>
        {/* A plain link, not fetch-and-blob: the browser streams it straight to
            disk with the filename the server sets, and a large export never
            has to be held in memory. */}
        <a
          href="/api/account/export"
          download
          className="inline-flex h-9 items-center gap-2 rounded-md border px-3 text-sm font-medium transition-colors hover:bg-accent"
        >
          <Download className="h-4 w-4" />
          Export my data
        </a>
      </div>

      {summary !== null && summary.length > 0 && (
        <div>
          <p className="mb-2 text-sm font-medium">What is stored right now</p>
          <ul className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
            {summary.map((s) => (
              <li key={s.table} className="flex justify-between gap-3">
                <span className="text-muted-foreground">{LABELS[s.table] ?? s.table}</span>
                <span className="tabular-nums">{s.rows.toLocaleString()}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="rounded-lg border border-destructive/40 p-4">
        <div className="flex items-start gap-2">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
          <div className="min-w-0 space-y-3">
            <div>
              <p className="font-medium">Delete everything</p>
              <p className="text-sm text-muted-foreground">
                Permanent erasure of all {totalRows.toLocaleString()} records, not a
                hidden flag. There is no undo, and no backup you can restore yourself.
                Export first if you want a copy.
              </p>
            </div>

            {!canDelete ? (
              <p className="text-sm text-muted-foreground">
                Only the household owner can do this. You can leave the household instead.
              </p>
            ) : !confirming ? (
              <Button variant="outline" size="sm" onClick={() => setConfirming(true)}>
                <Trash2 className="h-4 w-4" />
                Delete my data
              </Button>
            ) : (
              <div className="space-y-2">
                <Label htmlFor="delete-confirm" className="text-sm">
                  Type <span className="font-mono font-semibold">{CONFIRMATION}</span> to
                  confirm
                </Label>
                <div className="flex flex-wrap gap-2">
                  <Input
                    id="delete-confirm"
                    value={typed}
                    onChange={(e) => setTyped(e.target.value)}
                    autoComplete="off"
                    className="max-w-[220px] font-mono"
                  />
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={handleDelete}
                    disabled={typed !== CONFIRMATION || busy !== null}
                  >
                    {busy === "delete" ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                    Erase permanently
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setConfirming(false);
                      setTyped("");
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {message && (
        <div
          className={`rounded-md p-3 text-sm ${
            message.type === "ok"
              ? "bg-emerald-500/10 text-emerald-600"
              : "bg-destructive/10 text-destructive"
          }`}
        >
          {message.text}
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        What RetireWise stores and where it goes is described in the{" "}
        <a href="/legal/privacy" className="underline">
          privacy notice
        </a>
        .
      </p>
    </div>
  );
}
