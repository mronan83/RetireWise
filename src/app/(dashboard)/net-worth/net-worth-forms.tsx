"use client";

import { useState, useActionState } from "react";
import { useState as useLocalState } from "react";
import { Plus, Home, PiggyBank, CreditCard, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ACCOUNT_OWNER_LABELS } from "@/lib/constants";
import { DEBT_TYPE_LABELS, CASH_TYPE_LABELS } from "@/lib/constants-net-worth";
import {
  createRealEstate,
  createCashReserve,
  createDebt,
} from "@/lib/actions/net-worth";

type FormType = "real_estate" | "cash" | "debt" | null;

export function NetWorthForms() {
  const [formType, setFormType] = useState<FormType>(null);

  return (
    <>
      <div className="flex flex-wrap gap-3">
        <Button variant="outline" onClick={() => setFormType("real_estate")}>
          <Home className="mr-2 h-4 w-4" />
          Add Property
        </Button>
        <Button variant="outline" onClick={() => setFormType("cash")}>
          <PiggyBank className="mr-2 h-4 w-4" />
          Add Cash Account
        </Button>
        <Button variant="outline" onClick={() => setFormType("debt")}>
          <CreditCard className="mr-2 h-4 w-4" />
          Add Debt
        </Button>
      </div>

      <Dialog open={formType !== null} onOpenChange={(open) => !open && setFormType(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {formType === "real_estate" && "Add Property"}
              {formType === "cash" && "Add Cash Account"}
              {formType === "debt" && "Add Debt"}
            </DialogTitle>
          </DialogHeader>
          {formType === "real_estate" && (
            <RealEstateForm onSuccess={() => setFormType(null)} />
          )}
          {formType === "cash" && (
            <CashForm onSuccess={() => setFormType(null)} />
          )}
          {formType === "debt" && (
            <DebtForm onSuccess={() => setFormType(null)} />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function RealEstateForm({ onSuccess }: { onSuccess: () => void }) {
  const [address, setAddress] = useLocalState("");

  const [error, formAction, isPending] = useActionState(
    async (_prev: string | null, formData: FormData) => {
      try {
        await createRealEstate(formData);
        onSuccess();
        return null;
      } catch (e) {
        return e instanceof Error ? e.message : "Failed";
      }
    },
    null
  );

  const zillowUrl = address.trim()
    ? `https://www.zillow.com/homes/${encodeURIComponent(address.trim().replace(/\s+/g, "-"))}_rb/`
    : null;

  return (
    <form action={formAction} className="space-y-4">
      {error && <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <Label>Owner</Label>
          <Select name="owner" defaultValue="self">
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {Object.entries(ACCOUNT_OWNER_LABELS).map(([v, l]) => (
                <SelectItem key={v} value={v}>{l}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>Property Name</Label>
          <Input name="name" placeholder="e.g. Primary Home" required />
        </div>
      </div>

      <div className="space-y-1">
        <Label>Address</Label>
        <Input
          name="address"
          placeholder="123 Main St, City, State ZIP"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
        />
      </div>

      {/* Zillow lookup */}
      <div className="flex items-center gap-3">
        {zillowUrl ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => window.open(zillowUrl, "_blank")}
          >
            <ExternalLink className="mr-2 h-3.5 w-3.5" />
            Check Zestimate on Zillow
          </Button>
        ) : (
          <p className="text-xs text-muted-foreground">
            Enter an address above to get a one-click Zillow Zestimate lookup
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <Label>Estimated Value ($)</Label>
          <Input name="estimatedValue" type="number" step="0.01" placeholder="450000" required />
          <p className="text-xs text-muted-foreground">From Zillow Zestimate or recent comps</p>
        </div>
        <div className="space-y-1">
          <Label>Mortgage Balance ($)</Label>
          <Input name="mortgageBalance" type="number" step="0.01" placeholder="280000" />
          <p className="text-xs text-muted-foreground">0 if paid off</p>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-4">
        <div className="space-y-1">
          <Label>Mortgage Rate (%)</Label>
          <Input name="mortgageRate" type="number" step="0.001" placeholder="6.5" />
        </div>
        <div className="space-y-1">
          <Label>Monthly Payment ($)</Label>
          <Input name="monthlyPayment" type="number" step="0.01" placeholder="2100" />
        </div>
        <div className="space-y-1">
          <Label>Valuation Date</Label>
          <Input name="lastValuationDate" type="date" />
        </div>
      </div>
      <div className="flex items-center gap-3">
        <Switch id="isPrimaryResidence" name="isPrimaryResidence" defaultChecked />
        <Label htmlFor="isPrimaryResidence">Primary residence</Label>
      </div>
      <Button type="submit" disabled={isPending} className="w-full">
        {isPending ? "Adding..." : "Add Property"}
      </Button>
    </form>
  );
}

function CashForm({ onSuccess }: { onSuccess: () => void }) {
  const [error, formAction, isPending] = useActionState(
    async (_prev: string | null, formData: FormData) => {
      try {
        await createCashReserve(formData);
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
      {error && <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <Label>Owner</Label>
          <Select name="owner" defaultValue="self">
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {Object.entries(ACCOUNT_OWNER_LABELS).map(([v, l]) => (
                <SelectItem key={v} value={v}>{l}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>Account Type</Label>
          <Select name="accountType" defaultValue="checking">
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {Object.entries(CASH_TYPE_LABELS).map(([v, l]) => (
                <SelectItem key={v} value={v}>{l}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="space-y-1">
        <Label>Account Name</Label>
        <Input name="name" placeholder="e.g. Chase Checking" required />
      </div>
      <div className="grid grid-cols-3 gap-4">
        <div className="space-y-1">
          <Label>Balance ($)</Label>
          <Input name="balance" type="number" step="0.01" placeholder="15000" required />
        </div>
        <div className="space-y-1">
          <Label>APY (%)</Label>
          <Input name="interestRate" type="number" step="0.01" placeholder="4.5" />
        </div>
        <div className="space-y-1">
          <Label>Institution</Label>
          <Input name="institution" placeholder="e.g. Chase" />
        </div>
      </div>
      <Button type="submit" disabled={isPending} className="w-full">
        {isPending ? "Adding..." : "Add Cash Account"}
      </Button>
    </form>
  );
}

function DebtForm({ onSuccess }: { onSuccess: () => void }) {
  const [error, formAction, isPending] = useActionState(
    async (_prev: string | null, formData: FormData) => {
      try {
        await createDebt(formData);
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
      {error && <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <Label>Owner</Label>
          <Select name="owner" defaultValue="self">
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {Object.entries(ACCOUNT_OWNER_LABELS).map(([v, l]) => (
                <SelectItem key={v} value={v}>{l}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>Debt Type</Label>
          <Select name="debtType" defaultValue="mortgage">
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {Object.entries(DEBT_TYPE_LABELS).map(([v, l]) => (
                <SelectItem key={v} value={v}>{l}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="space-y-1">
        <Label>Name</Label>
        <Input name="name" placeholder="e.g. Primary Mortgage" required />
      </div>
      <div className="grid grid-cols-3 gap-4">
        <div className="space-y-1">
          <Label>Balance ($)</Label>
          <Input name="currentBalance" type="number" step="0.01" placeholder="280000" required />
        </div>
        <div className="space-y-1">
          <Label>Rate (%)</Label>
          <Input name="interestRate" type="number" step="0.01" placeholder="6.5" required />
        </div>
        <div className="space-y-1">
          <Label>Monthly ($)</Label>
          <Input name="monthlyPayment" type="number" step="0.01" placeholder="2100" required />
        </div>
      </div>
      <div className="space-y-1">
        <Label>Estimated Payoff Date</Label>
        <Input name="payoffDate" type="date" />
        <p className="text-xs text-muted-foreground">When will this be paid off? Helps retirement projections.</p>
      </div>
      <Button type="submit" disabled={isPending} className="w-full">
        {isPending ? "Adding..." : "Add Debt"}
      </Button>
    </form>
  );
}
