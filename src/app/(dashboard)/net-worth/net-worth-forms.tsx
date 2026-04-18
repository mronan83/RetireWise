"use client";

import { useState, useActionState } from "react";
import { useState as useLocalState } from "react";
import { Plus, Home, PiggyBank, CreditCard, Car, ExternalLink, Search } from "lucide-react";
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
import { DEBT_TYPE_LABELS, CASH_TYPE_LABELS, VEHICLE_TYPE_LABELS, VEHICLE_CONDITION_LABELS, getValuationUrl } from "@/lib/constants-net-worth";
import {
  createRealEstate,
  createCashReserve,
  createDebt,
} from "@/lib/actions/net-worth";
import { addVehicle, decodeVIN } from "@/lib/actions/vehicles";

type FormType = "real_estate" | "cash" | "debt" | "vehicle" | null;

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
        <Button variant="outline" onClick={() => setFormType("vehicle")}>
          <Car className="mr-2 h-4 w-4" />
          Add Vehicle
        </Button>
        <Button variant="outline" onClick={() => setFormType("debt")}>
          <CreditCard className="mr-2 h-4 w-4" />
          Add Debt
        </Button>
      </div>

      <Dialog open={formType !== null} onOpenChange={(open) => !open && setFormType(null)}>
        <DialogContent className={formType === "vehicle" ? "max-w-lg" : undefined}>
          <DialogHeader>
            <DialogTitle>
              {formType === "real_estate" && "Add Property"}
              {formType === "cash" && "Add Cash Account"}
              {formType === "vehicle" && "Add Vehicle"}
              {formType === "debt" && "Add Debt"}
            </DialogTitle>
          </DialogHeader>
          {formType === "real_estate" && (
            <RealEstateForm onSuccess={() => setFormType(null)} />
          )}
          {formType === "cash" && (
            <CashForm onSuccess={() => setFormType(null)} />
          )}
          {formType === "vehicle" && (
            <VehicleForm onSuccess={() => setFormType(null)} />
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

function VehicleForm({ onSuccess }: { onSuccess: () => void }) {
  const [vin, setVin] = useLocalState("");
  const [vinLoading, setVinLoading] = useLocalState(false);
  const [vinResult, setVinResult] = useLocalState<string | null>(null);
  const [year, setYear] = useLocalState("");
  const [make, setMake] = useLocalState("");
  const [model, setModel] = useLocalState("");
  const [trim, setTrim] = useLocalState("");
  const [vehicleType, setVehicleType] = useLocalState("car");
  const [hasLoan, setHasLoan] = useLocalState(false);

  const [error, formAction, isPending] = useActionState(
    async (_prev: string | null, formData: FormData) => {
      try {
        await addVehicle({
          owner: (formData.get("owner") as "self" | "spouse") || "self",
          name: (formData.get("name") as string) || `${year} ${make} ${model}`.trim(),
          vehicleType,
          year: year ? parseInt(year) : undefined,
          make: make || undefined,
          model: model || undefined,
          trim: trim || undefined,
          vin: vin || undefined,
          mileage: formData.get("mileage") ? parseInt(formData.get("mileage") as string) : undefined,
          condition: (formData.get("condition") as string) || undefined,
          estimatedValue: parseFloat(formData.get("estimatedValue") as string) || 0,
          hasLoan,
          loanBalance: hasLoan ? parseFloat(formData.get("loanBalance") as string) || 0 : 0,
          loanRate: hasLoan ? parseFloat(formData.get("loanRate") as string) || undefined : undefined,
          loanMonthlyPayment: hasLoan ? parseFloat(formData.get("loanMonthlyPayment") as string) || undefined : undefined,
          loanRemainingMonths: hasLoan && formData.get("loanRemainingMonths") ? parseInt(formData.get("loanRemainingMonths") as string) : undefined,
          purchasePrice: formData.get("purchasePrice") ? parseFloat(formData.get("purchasePrice") as string) : undefined,
          notes: (formData.get("notes") as string) || undefined,
        });
        onSuccess();
        return null;
      } catch (e) {
        return e instanceof Error ? e.message : "Failed";
      }
    },
    null
  );

  const handleVinDecode = async () => {
    if (vin.length < 11) { setVinResult("VIN must be at least 11 characters"); return; }
    setVinLoading(true);
    setVinResult(null);
    try {
      const result = await decodeVIN(vin);
      if (result.year) setYear(String(result.year));
      if (result.make) setMake(result.make);
      if (result.model) setModel(result.model);
      if (result.trim) setTrim(result.trim);
      if (result.vehicleType) setVehicleType(result.vehicleType);
      setVinResult(`Found: ${result.year} ${result.make} ${result.model}${result.trim ? ` ${result.trim}` : ""}`);
    } catch {
      setVinResult("VIN decode failed — enter details manually");
    } finally {
      setVinLoading(false);
    }
  };

  const autoName = [year, make, model].filter(Boolean).join(" ");
  const valUrl = getValuationUrl({ vehicleType, year: year ? parseInt(year) : null, make, model });

  return (
    <form action={formAction} className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
      {error && <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}

      {/* VIN Decoder */}
      <div className="space-y-1">
        <Label>VIN (optional — auto-fills year/make/model)</Label>
        <div className="flex gap-2">
          <Input
            value={vin}
            onChange={(e) => setVin(e.target.value.toUpperCase())}
            placeholder="1HGCG5655WA..."
            className="font-mono text-xs"
          />
          <Button type="button" variant="outline" size="sm" onClick={handleVinDecode} disabled={vinLoading}>
            <Search className="mr-1 h-3.5 w-3.5" />
            {vinLoading ? "..." : "Decode"}
          </Button>
        </div>
        {vinResult && <p className="text-xs text-muted-foreground">{vinResult}</p>}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <Label>Owner</Label>
          <Select name="owner" defaultValue="self">
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {Object.entries(ACCOUNT_OWNER_LABELS).map(([val, label]) => (
                <SelectItem key={val} value={val}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>Type</Label>
          <Select value={vehicleType} onValueChange={(v) => v && setVehicleType(v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {Object.entries(VEHICLE_TYPE_LABELS).map(([val, label]) => (
                <SelectItem key={val} value={val}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-3">
        <div className="space-y-1">
          <Label>Year</Label>
          <Input value={year} onChange={(e) => setYear(e.target.value)} placeholder="2022" />
        </div>
        <div className="space-y-1">
          <Label>Make</Label>
          <Input value={make} onChange={(e) => setMake(e.target.value)} placeholder="Toyota" />
        </div>
        <div className="space-y-1">
          <Label>Model</Label>
          <Input value={model} onChange={(e) => setModel(e.target.value)} placeholder="Tacoma" />
        </div>
        <div className="space-y-1">
          <Label>Trim</Label>
          <Input value={trim} onChange={(e) => setTrim(e.target.value)} placeholder="TRD Off-Road" />
        </div>
      </div>

      <div className="space-y-1">
        <Label>Name</Label>
        <Input name="name" defaultValue={autoName} placeholder={autoName || "2022 Toyota Tacoma"} />
        <p className="text-xs text-muted-foreground">How you want this shown in your dashboard</p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="space-y-1">
          <Label>Mileage</Label>
          <Input name="mileage" type="number" placeholder="45000" />
        </div>
        <div className="space-y-1">
          <Label>Condition</Label>
          <Select name="condition" defaultValue="good">
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {Object.entries(VEHICLE_CONDITION_LABELS).map(([val, label]) => (
                <SelectItem key={val} value={val}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>Purchase Price</Label>
          <Input name="purchasePrice" type="number" step="1" placeholder="35000" />
        </div>
      </div>

      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <Label>Current Market Value ($)</Label>
          <a href={valUrl.url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline flex items-center gap-1">
            <ExternalLink className="h-3 w-3" />
            Look up on {valUrl.label}
          </a>
        </div>
        <Input name="estimatedValue" type="number" step="1" placeholder="28000" required />
      </div>

      {/* Loan toggle */}
      <div className="flex items-center gap-3 rounded-lg border p-3">
        <Switch checked={hasLoan} onCheckedChange={setHasLoan} />
        <div>
          <Label className="text-sm font-medium">This vehicle has a loan</Label>
          <p className="text-xs text-muted-foreground">Track the loan balance and payments</p>
        </div>
      </div>

      {hasLoan && (
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label>Loan Balance ($)</Label>
            <Input name="loanBalance" type="number" step="0.01" placeholder="18000" required />
          </div>
          <div className="space-y-1">
            <Label>Interest Rate (%)</Label>
            <Input name="loanRate" type="number" step="0.01" placeholder="5.9" />
          </div>
          <div className="space-y-1">
            <Label>Monthly Payment ($)</Label>
            <Input name="loanMonthlyPayment" type="number" step="0.01" placeholder="450" />
          </div>
          <div className="space-y-1">
            <Label>Months Remaining</Label>
            <Input name="loanRemainingMonths" type="number" placeholder="36" />
          </div>
        </div>
      )}

      <div className="space-y-1">
        <Label>Notes (optional)</Label>
        <Input name="notes" placeholder="Any additional details..." />
      </div>

      <Button type="submit" disabled={isPending} className="w-full">
        {isPending ? "Adding..." : "Add Vehicle"}
      </Button>
    </form>
  );
}
