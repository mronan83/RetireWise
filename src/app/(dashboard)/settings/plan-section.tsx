"use client";

import { useEffect, useState } from "react";
import { Check, CreditCard, ExternalLink, Loader2, AlertCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type Status = {
  billingEnabled: boolean;
  billingDisabledReason: string | null;
  current: {
    planId: string;
    planName: string;
    status: string;
    source: "billing_disabled" | "comped" | "subscription" | "default";
    currentPeriodEnd: string | null;
    cancelAtPeriodEnd: boolean;
    paymentNeedsAttention: boolean;
  };
  features: { id: string; label: string }[];
  limits: Record<string, number | null>;
  plans: {
    id: string;
    name: string;
    blurb: string;
    price: string;
    purchasable: boolean;
    featureCount: number;
  }[];
};

const SOURCE_NOTE: Record<Status["current"]["source"], string> = {
  billing_disabled: "RetireWise is free for friends and family. No card, no limits.",
  comped: "Your household has complimentary access to everything, permanently.",
  subscription: "Billed through Stripe.",
  default: "You are on the free plan.",
};

export function PlanSection() {
  const [status, setStatus] = useState<Status | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/billing/status")
      .then((r) => r.json())
      .then((d) => setStatus(d.error ? null : d))
      .catch(() => {});
  }, []);

  const go = async (path: string, body?: unknown) => {
    setBusy(path);
    setError(null);
    try {
      const res = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body ?? {}),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Something went wrong.");
      if (data.url) window.location.href = data.url;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(null);
    }
  };

  if (!status) {
    return (
      <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading plan…
      </div>
    );
  }

  const { current } = status;

  return (
    <div className="space-y-5">
      <div className="rounded-lg border p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-heading text-lg font-semibold">
                {current.planName}
              </span>
              <Badge variant="secondary">Free</Badge>
              {current.source === "comped" && <Badge variant="outline">Comped</Badge>}
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {SOURCE_NOTE[current.source]}
            </p>
          </div>
          {status.billingEnabled && current.source === "subscription" && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => go("/api/billing/portal")}
              disabled={busy !== null}
            >
              {busy === "/api/billing/portal" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <CreditCard className="h-4 w-4" />
              )}
              Manage billing
            </Button>
          )}
        </div>

        {current.paymentNeedsAttention && (
          <div className="mt-3 flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
            <span>
              Your last payment did not go through. Access continues for now —
              update your card from Manage billing.
            </span>
          </div>
        )}

        {current.cancelAtPeriodEnd && current.currentPeriodEnd && (
          <p className="mt-3 text-sm text-muted-foreground">
            Cancels on {new Date(current.currentPeriodEnd).toLocaleDateString()}.
          </p>
        )}
      </div>

      <div>
        <p className="mb-2 text-sm font-medium">Included</p>
        <ul className="grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
          {status.features.map((f) => (
            <li key={f.id} className="flex items-center gap-2 text-sm">
              <Check className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
              <span className="text-muted-foreground">{f.label}</span>
            </li>
          ))}
        </ul>
      </div>

      {!status.billingEnabled && (
        <p className="text-xs text-muted-foreground">
          Paid plans are switched off on this deployment
          {status.billingDisabledReason ? ` — ${status.billingDisabledReason.toLowerCase()}` : "."}{" "}
          Checkout, the customer portal and the Stripe webhook are already built;
          turning them on is configuration only. Households created while the app
          is free keep full access either way.
        </p>
      )}

      {status.billingEnabled &&
        status.plans
          .filter((p) => p.purchasable && p.id !== current.planId)
          .map((p) => (
            <div
              key={p.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4"
            >
              <div className="min-w-0">
                <p className="font-medium">
                  {p.name} · {p.price}
                </p>
                <p className="text-sm text-muted-foreground">{p.blurb}</p>
              </div>
              <Button
                size="sm"
                onClick={() => go("/api/billing/checkout", { planId: p.id })}
                disabled={busy !== null}
              >
                {busy === "/api/billing/checkout" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ExternalLink className="h-4 w-4" />
                )}
                Upgrade
              </Button>
            </div>
          ))}

      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
