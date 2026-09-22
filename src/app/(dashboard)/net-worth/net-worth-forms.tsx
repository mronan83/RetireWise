"use client";

import { useState, useActionState } from "react";
import { useState as useLocalState } from "react";
import { Home, PiggyBank, CreditCard, Car, ExternalLink, Search, Pencil, Trash2, TrendingUp, Link2 } from "lucide-react";
import { ItemHistoryChart, type HistoryPoint } from "./item-history-chart";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
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
import { formatCurrency } from "@/lib/utils/format";
import { cn } from "@/lib/utils";
import {
  createRealEstate, updateRealEstate, deleteRealEstate,
  createCashReserve, updateCashReserve, deleteCashReserve,
  createDebt, updateDebt, deleteDebt,
} from "@/lib/actions/net-worth";
import { addVehicle, updateVehicle, deleteVehicle, decodeVIN } from "@/lib/actions/vehicles";
import { LastUpdated } from "@/components/ui/last-updated";

// --- Types ---
type RealEstateItem = {
  id: string; owner: string; name: string; address: string | null;
  estimatedValue: string; mortgageBalance: string | null; mortgageRate: string | null;
  monthlyPayment: string | null; isPrimaryResidence: boolean | null; lastValuationDate: string | null;
};
type CashItem = {
  id: string; owner: string; name: string; accountType: string;
  institution: string | null; balance: string; interestRate: string | null;
  dataSource?: string | null; lastSyncedAt?: Date | string | null;
  updatedAt?: Date | string | null;
};
type DebtItem = {
  id: string; owner: string; name: string; debtType: string;
  securedByType?: string | null; securedById?: string | null;
  currentBalance: string; interestRate: string; monthlyPayment: string; payoffDate: string | null;
  dataSource?: string | null; lastSyncedAt?: Date | string | null;
  updatedAt?: Date | string | null;
};
type VehicleItem = {
  id: string; owner: string; name: string; vehicleType: string;
  year: number | null; make: string | null; model: string | null; trim: string | null;
  vin: string | null; mileage: number | null; condition: string | null;
  estimatedValue: string; hasLoan: boolean | null; loanBalance: string | null;
  loanRate: string | null; loanMonthlyPayment: string | null; loanRemainingMonths: number | null;
  purchasePrice: string | null;
};

/**
 * What each asset actually owes, composed in src/lib/net-worth/compose.ts.
 *
 * Read through the linked debt rather than copied into the asset's own
 * columns, so the card follows the synced balance without the same number
 * living in two places — which is the arrangement that had net worth
 * subtracting these loans twice.
 */
export type AssetLoanView = {
  owed: number;
  equity: number;
  owedSource: "linked" | "embedded" | "none";
  loan: {
    balance: number;
    rate: number | null;
    monthlyPayment: number | null;
    from: { id: string; name: string } | null;
  } | null;
};

/**
 * Which list a section renders is decided by the section, not by which arrays
 * the caller happened to fill.
 *
 * It used to be decided by array length alone, so every caller had to pass
 * `[]` for the three lists its section does not show. That convention is what
 * hid the debt form's "secured against" picker: the debts section was given
 * `properties={[]} vehicles={[]}` to keep those rows out, the picker's own
 * guard saw no assets to offer, and the linking feature could not be reached
 * from anywhere in the app.
 */
type Props = {
  section: "real_estate" | "cash" | "vehicle" | "debt";
  properties: RealEstateItem[];
  cash: CashItem[];
  debts: DebtItem[];
  vehicles: VehicleItem[];
  /** Keyed by asset id. Absent for an asset the composer did not see. */
  assetLoans?: Record<string, AssetLoanView>;
  historyRecord?: Record<string, HistoryPoint[]>;
};

type FormMode =
  | { kind: "add"; type: "real_estate" | "cash" | "debt" | "vehicle" }
  | { kind: "edit"; type: "real_estate"; item: RealEstateItem }
  | { kind: "edit"; type: "cash"; item: CashItem }
  | { kind: "edit"; type: "debt"; item: DebtItem }
  | { kind: "edit"; type: "vehicle"; item: VehicleItem }
  | null;

// --- Row action buttons ---
function RowActions({
  onEdit, onDelete, onChart, chartActive,
}: {
  onEdit: () => void;
  onDelete: () => void;
  onChart?: () => void;
  chartActive?: boolean;
}) {
  return (
    <div className="flex items-center gap-1 shrink-0 ml-3">
      {onChart && (
        <button
          onClick={onChart}
          className={cn(
            "p-1.5 rounded transition-colors",
            chartActive
              ? "text-primary bg-primary/10"
              : "text-muted-foreground hover:text-primary hover:bg-primary/10"
          )}
          aria-label="View history"
        >
          <TrendingUp className="h-3.5 w-3.5" />
        </button>
      )}
      <button
        onClick={onEdit}
        className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        aria-label="Edit"
      >
        <Pencil className="h-3.5 w-3.5" />
      </button>
      <button
        onClick={onDelete}
        className="p-1.5 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
        aria-label="Delete"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

// --- Main component ---
/**
 * How old one balance is, and whether anything is keeping it current.
 *
 * A linked balance ages in days and should be questioned in a week. A figure
 * someone typed ages in months and is normal at six weeks — so the two are
 * measured against different thresholds rather than one that would either
 * cry wolf or stay silent.
 */
function ItemAge({
  dataSource,
  lastSyncedAt,
  updatedAt,
}: {
  dataSource?: string | null;
  lastSyncedAt?: Date | string | null;
  updatedAt?: Date | string | null;
}) {
  const linked = dataSource === "plaid";
  const at = linked ? (lastSyncedAt ?? updatedAt) : updatedAt;
  if (at === undefined) return null;
  return (
    <LastUpdated
      at={at}
      kind={linked ? "linked_balance" : "manual_balance"}
      label={linked ? "Synced" : "Edited"}
      className="mt-0.5"
    />
  );
}

export function NetWorthForms({ section, properties, cash, debts, vehicles, assetLoans = {}, historyRecord = {} }: Props) {
  const [mode, setMode] = useState<FormMode>(null);
  const [expandedChart, setExpandedChart] = useState<string | null>(null);
  const close = () => setMode(null);

  const historyMap = new Map(Object.entries(historyRecord));
  const toggleChart = (id: string) => setExpandedChart((prev) => (prev === id ? null : id));

  const handleDelete = async (action: () => Promise<unknown>, label: string) => {
    if (!confirm(`Delete "${label}"? This cannot be undone.`)) return;
    await action();
  };

  const dialogTitle = mode === null ? "" :
    mode.kind === "add" ? (
      mode.type === "real_estate" ? "Add Property" :
      mode.type === "cash" ? "Add Cash Account" :
      mode.type === "vehicle" ? "Add Vehicle" : "Add Debt"
    ) : (
      mode.type === "real_estate" ? "Edit Property" :
      mode.type === "cash" ? "Edit Cash Account" :
      mode.type === "vehicle" ? "Edit Vehicle" : "Edit Debt"
    );

  return (
    <div data-testid="nw-section" data-section={section} className="contents">
      {/* Real Estate rows */}
      {section === "real_estate" && properties.length > 0 && (
        <div className="space-y-2 mb-4">
          {properties.map((p) => {
            const history = historyMap.get(p.id) || [];
            const hasHistory = history.length >= 2;
            const isExpanded = expandedChart === p.id;
            return (
              <div key={p.id} className="rounded-lg border overflow-hidden">
                <div className="flex items-center justify-between p-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm">{p.name}</span>
                      <Badge variant={p.owner === "spouse" ? "default" : "secondary"} className="text-xs">
                        {ACCOUNT_OWNER_LABELS[p.owner as keyof typeof ACCOUNT_OWNER_LABELS]}
                      </Badge>
                      {p.isPrimaryResidence && <Badge variant="outline" className="text-xs">Primary</Badge>}
                      {p.address && (
                        <a href={`https://www.zillow.com/homes/${encodeURIComponent(p.address.replace(/\s+/g, "-"))}_rb/`}
                          target="_blank" rel="noopener noreferrer" className="text-[10px] text-primary hover:underline">
                          Zillow
                        </a>
                      )}
                    </div>
                    {p.address && <p className="text-xs text-muted-foreground truncate">{p.address}</p>}
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Value: {formatCurrency(Number(p.estimatedValue))}
                      {assetLoans[p.id]?.loan && (
                        <> | Mortgage: {formatCurrency(assetLoans[p.id].loan!.balance)}
                        {assetLoans[p.id].loan!.rate !== null && <> @ {assetLoans[p.id].loan!.rate}%</>}
                        {assetLoans[p.id].loan!.monthlyPayment !== null && (
                          <> | {formatCurrency(assetLoans[p.id].loan!.monthlyPayment!)}/mo</>
                        )}
                        </>
                      )}
                    </p>
                    {/* Which debt the figure above is coming from, so the card
                        says whose number it is showing rather than implying
                        it was typed here. */}
                    {assetLoans[p.id]?.loan?.from && (
                      <p className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground">
                        <Link2 className="h-3 w-3 shrink-0" />
                        tracking <span className="font-mono">{assetLoans[p.id].loan!.from!.name}</span>
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="text-right">
                      <p className="font-mono font-medium text-sm text-green-500">
                        {formatCurrency(assetLoans[p.id]?.equity ?? Number(p.estimatedValue))}
                      </p>
                      <p className="text-xs text-muted-foreground">equity</p>
                    </div>
                    <RowActions
                      onEdit={() => setMode({ kind: "edit", type: "real_estate", item: p })}
                      onDelete={() => handleDelete(() => deleteRealEstate(p.id), p.name)}
                      onChart={hasHistory ? () => toggleChart(p.id) : undefined}
                      chartActive={isExpanded}
                    />
                  </div>
                </div>
                {isExpanded && (
                  <div className="border-t px-3 pb-2">
                    <ItemHistoryChart itemName={p.name} itemType="real_estate" history={history} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Cash rows */}
      {section === "cash" && cash.length > 0 && (
        <div className="space-y-2 mb-4">
          {cash.map((c) => {
            const history = historyMap.get(c.id) || [];
            const hasHistory = history.length >= 2;
            const isExpanded = expandedChart === c.id;
            return (
              <div key={c.id} className="rounded-lg border overflow-hidden">
                <div className="flex items-center justify-between p-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">{c.name}</span>
                      <Badge variant={c.owner === "spouse" ? "default" : "secondary"} className="text-xs">
                        {ACCOUNT_OWNER_LABELS[c.owner as keyof typeof ACCOUNT_OWNER_LABELS]}
                      </Badge>
                      <Badge variant="outline" className="text-xs">
                        {CASH_TYPE_LABELS[c.accountType as keyof typeof CASH_TYPE_LABELS]}
                      </Badge>
                    </div>
                    {(c.institution || c.interestRate) && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {c.institution}{c.interestRate && <> | {Number(c.interestRate)}% APY</>}
                      </p>
                    )}
                    <ItemAge
                      dataSource={c.dataSource}
                      lastSyncedAt={c.lastSyncedAt}
                      updatedAt={c.updatedAt}
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <p className="font-mono font-medium text-sm">{formatCurrency(Number(c.balance))}</p>
                    <RowActions
                      onEdit={() => setMode({ kind: "edit", type: "cash", item: c })}
                      onDelete={() => handleDelete(() => deleteCashReserve(c.id), c.name)}
                      onChart={hasHistory ? () => toggleChart(c.id) : undefined}
                      chartActive={isExpanded}
                    />
                  </div>
                </div>
                {isExpanded && (
                  <div className="border-t px-3 pb-2">
                    <ItemHistoryChart itemName={c.name} itemType="cash_reserve" history={history} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Vehicle rows */}
      {section === "vehicle" && vehicles.length > 0 && (
        <div className="space-y-2 mb-4">
          {vehicles.map((v) => {
            const equity = assetLoans[v.id]?.equity ?? Number(v.estimatedValue);
            const vLoan = assetLoans[v.id]?.loan ?? null;
            const val = getValuationUrl(v);
            const history = historyMap.get(v.id) || [];
            const hasHistory = history.length >= 2;
            const isExpanded = expandedChart === v.id;
            return (
              <div key={v.id} className="rounded-lg border overflow-hidden">
                <div className="flex items-center justify-between p-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm">{v.name}</span>
                      <Badge variant={v.owner === "spouse" ? "default" : "secondary"} className="text-xs">
                        {ACCOUNT_OWNER_LABELS[v.owner as keyof typeof ACCOUNT_OWNER_LABELS]}
                      </Badge>
                      <Badge variant="outline" className="text-xs">
                        {VEHICLE_TYPE_LABELS[v.vehicleType as keyof typeof VEHICLE_TYPE_LABELS] || v.vehicleType}
                      </Badge>
                      <a href={val.url} target="_blank" rel="noopener noreferrer"
                        className="text-[10px] text-primary hover:underline">{val.label}</a>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {[v.year, v.make, v.model, v.trim].filter(Boolean).join(" ")}
                      {v.mileage && <> · {v.mileage.toLocaleString()} mi</>}
                      {v.condition && <> · {v.condition}</>}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Value: {formatCurrency(Number(v.estimatedValue))}
                      {vLoan && (
                        <> | Loan: {formatCurrency(vLoan.balance)}
                        {vLoan.rate !== null && <> @ {vLoan.rate}%</>}
                        {vLoan.monthlyPayment !== null && (
                          <> | {formatCurrency(vLoan.monthlyPayment)}/mo</>
                        )}
                        </>
                      )}
                    </p>
                    {vLoan?.from && (
                      <p className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground">
                        <Link2 className="h-3 w-3 shrink-0" />
                        tracking <span className="font-mono">{vLoan.from.name}</span>
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="text-right shrink-0">
                      <p className={cn("font-mono font-medium text-sm", equity >= 0 ? "text-purple-400" : "text-red-500")}>
                        {formatCurrency(equity)}
                      </p>
                      <p className="text-xs text-muted-foreground">equity</p>
                    </div>
                    <RowActions
                      onEdit={() => setMode({ kind: "edit", type: "vehicle", item: v })}
                      onDelete={() => handleDelete(() => deleteVehicle(v.id), v.name)}
                      onChart={hasHistory ? () => toggleChart(v.id) : undefined}
                      chartActive={isExpanded}
                    />
                  </div>
                </div>
                {isExpanded && (
                  <div className="border-t px-3 pb-2">
                    <ItemHistoryChart itemName={v.name} itemType="vehicle" history={history} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Debt rows */}
      {section === "debt" && debts.length > 0 && (
        <div className="space-y-2 mb-4">
          {debts.map((d) => {
            const history = historyMap.get(d.id) || [];
            const hasHistory = history.length >= 2;
            const isExpanded = expandedChart === d.id;
            return (
              <div key={d.id} className="rounded-lg border overflow-hidden">
                <div className="flex items-center justify-between p-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">{d.name}</span>
                      <Badge variant={d.owner === "spouse" ? "default" : "secondary"} className="text-xs">
                        {ACCOUNT_OWNER_LABELS[d.owner as keyof typeof ACCOUNT_OWNER_LABELS]}
                      </Badge>
                      <Badge variant="outline" className="text-xs">
                        {DEBT_TYPE_LABELS[d.debtType as keyof typeof DEBT_TYPE_LABELS]}
                      </Badge>
                      {/* Visible on the row, because it changes which figure
                          the asset's equity is calculated from. */}
                      {d.securedByType && d.securedById && (
                        <Badge variant="secondary" className="text-xs">
                          secured ·{" "}
                          {(d.securedByType === "vehicle"
                            ? vehicles.find((v) => v.id === d.securedById)?.name
                            : properties.find((p) => p.id === d.securedById)?.name) ??
                            "asset removed"}
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {Number(d.interestRate)}% rate | {formatCurrency(Number(d.monthlyPayment))}/mo
                      {d.payoffDate && <> | Payoff: {d.payoffDate}</>}
                    </p>
                    <ItemAge
                      dataSource={d.dataSource}
                      lastSyncedAt={d.lastSyncedAt}
                      updatedAt={d.updatedAt}
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <p className="font-mono font-medium text-sm text-red-500">
                      {formatCurrency(Number(d.currentBalance))}
                    </p>
                    <RowActions
                      onEdit={() => setMode({ kind: "edit", type: "debt", item: d })}
                      onDelete={() => handleDelete(() => deleteDebt(d.id), d.name)}
                      onChart={hasHistory ? () => toggleChart(d.id) : undefined}
                      chartActive={isExpanded}
                    />
                  </div>
                </div>
                {isExpanded && (
                  <div className="border-t px-3 pb-2">
                    <ItemHistoryChart itemName={d.name} itemType="debt" history={history} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Add button — scoped to section */}
      <div className="pt-2">
        {section === "real_estate" && (
          <Button variant="outline" onClick={() => setMode({ kind: "add", type: "real_estate" })}>
            <Home className="mr-2 h-4 w-4" />Add Property
          </Button>
        )}
        {section === "cash" && (
          <Button variant="outline" onClick={() => setMode({ kind: "add", type: "cash" })}>
            <PiggyBank className="mr-2 h-4 w-4" />Add Cash Account
          </Button>
        )}
        {section === "vehicle" && (
          <Button variant="outline" onClick={() => setMode({ kind: "add", type: "vehicle" })}>
            <Car className="mr-2 h-4 w-4" />Add Vehicle
          </Button>
        )}
        {section === "debt" && (
          <Button variant="outline" onClick={() => setMode({ kind: "add", type: "debt" })}>
            <CreditCard className="mr-2 h-4 w-4" />Add Debt
          </Button>
        )}
      </div>

      <Dialog open={mode !== null} onOpenChange={(open) => !open && close()}>
        <DialogContent className={mode?.type === "vehicle" ? "max-w-lg" : undefined}>
          <DialogHeader>
            <DialogTitle>{dialogTitle}</DialogTitle>
          </DialogHeader>
          {mode?.type === "real_estate" && (
            <RealEstateForm
              linkedLoan={mode.kind === "edit" ? assetLoans[mode.item.id]?.loan : undefined}
              item={mode.kind === "edit" ? mode.item : undefined}
              onSuccess={close}
            />
          )}
          {mode?.type === "cash" && (
            <CashForm
              item={mode.kind === "edit" ? mode.item : undefined}
              onSuccess={close}
            />
          )}
          {mode?.type === "vehicle" && (
            <VehicleForm
              linkedLoan={mode.kind === "edit" ? assetLoans[mode.item.id]?.loan : undefined}
              item={mode.kind === "edit" ? mode.item : undefined}
              onSuccess={close}
            />
          )}
          {mode?.type === "debt" && (
            <DebtForm
              properties={properties}
              vehicles={vehicles}
              item={mode.kind === "edit" ? mode.item : undefined}
              onSuccess={close}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// --- Real Estate Form ---
function RealEstateForm({
  item,
  onSuccess,
  linkedLoan,
}: {
  item?: RealEstateItem;
  onSuccess: () => void;
  linkedLoan?: AssetLoanView["loan"];
}) {
  const [address, setAddress] = useLocalState(item?.address || "");
  const [isPrimary, setIsPrimary] = useLocalState(item?.isPrimaryResidence ?? true);

  const [error, formAction, isPending] = useActionState(
    async (_prev: string | null, formData: FormData) => {
      try {
        if (item) {
          await updateRealEstate(item.id, formData);
        } else {
          await createRealEstate(formData);
        }
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
          <Select name="owner" defaultValue={item?.owner || "self"}>
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
          <Input name="name" defaultValue={item?.name} placeholder="e.g. Primary Home" required />
        </div>
      </div>
      <div className="space-y-1">
        <Label>Address</Label>
        <Input name="address" placeholder="123 Main St, City, State ZIP"
          value={address} onChange={(e) => setAddress(e.target.value)} />
      </div>
      <div className="flex items-center gap-3">
        {zillowUrl ? (
          <Button type="button" variant="outline" size="sm" onClick={() => window.open(zillowUrl, "_blank")}>
            <ExternalLink className="mr-2 h-3.5 w-3.5" />Check Zestimate on Zillow
          </Button>
        ) : (
          <p className="text-xs text-muted-foreground">Enter an address above to get a one-click Zillow Zestimate lookup</p>
        )}
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <Label>Estimated Value ($)</Label>
          <Input name="estimatedValue" type="number" step="0.01" placeholder="450000"
            defaultValue={item ? Number(item.estimatedValue) : undefined} required />
          <p className="text-xs text-muted-foreground">From Zillow Zestimate or recent comps</p>
        </div>
        <div className="space-y-1">
          <Label>Mortgage Balance ($)</Label>
          <Input name="mortgageBalance" type="number" step="0.01" placeholder="280000"
            defaultValue={item?.mortgageBalance ? Number(item.mortgageBalance) : undefined} />
          {/* A field that no longer decides anything should say so, rather
              than accept a number that will be ignored. */}
          {linkedLoan?.from && (
            <p className="text-xs text-amber-600 dark:text-amber-500">
              Currently showing {formatCurrency(linkedLoan.balance)} from{" "}
              <span className="font-mono">{linkedLoan.from.name}</span>, which
              updates on its own. Anything entered here is kept but not used
              while that debt is linked.
            </p>
          )}
          <p className="text-xs text-muted-foreground">0 if paid off</p>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-4">
        <div className="space-y-1">
          <Label>Mortgage Rate (%)</Label>
          <Input name="mortgageRate" type="number" step="0.001" placeholder="6.5"
            defaultValue={item?.mortgageRate ? Number(item.mortgageRate) : undefined} />
        </div>
        <div className="space-y-1">
          <Label>Monthly Payment ($)</Label>
          <Input name="monthlyPayment" type="number" step="0.01" placeholder="2100"
            defaultValue={item?.monthlyPayment ? Number(item.monthlyPayment) : undefined} />
        </div>
        <div className="space-y-1">
          <Label>Valuation Date</Label>
          <Input name="lastValuationDate" type="date"
            defaultValue={item?.lastValuationDate || undefined} />
        </div>
      </div>
      <div className="flex items-center gap-3">
        <Switch id="isPrimaryResidence" name="isPrimaryResidence"
          checked={isPrimary} onCheckedChange={setIsPrimary} />
        <Label htmlFor="isPrimaryResidence">Primary residence</Label>
      </div>
      <Button type="submit" disabled={isPending} className="w-full">
        {isPending ? (item ? "Saving..." : "Adding...") : (item ? "Save Changes" : "Add Property")}
      </Button>
    </form>
  );
}

// --- Cash Form ---
function CashForm({ item, onSuccess }: { item?: CashItem; onSuccess: () => void }) {
  const [error, formAction, isPending] = useActionState(
    async (_prev: string | null, formData: FormData) => {
      try {
        if (item) {
          await updateCashReserve(item.id, formData);
        } else {
          await createCashReserve(formData);
        }
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
          <Select name="owner" defaultValue={item?.owner || "self"}>
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
          <Select name="accountType" defaultValue={item?.accountType || "checking"}>
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
        <Input name="name" defaultValue={item?.name} placeholder="e.g. Chase Checking" required />
      </div>
      <div className="grid grid-cols-3 gap-4">
        <div className="space-y-1">
          <Label>Balance ($)</Label>
          <Input name="balance" type="number" step="0.01" placeholder="15000"
            defaultValue={item ? Number(item.balance) : undefined} required />
        </div>
        <div className="space-y-1">
          <Label>APY (%)</Label>
          <Input name="interestRate" type="number" step="0.01" placeholder="4.5"
            defaultValue={item?.interestRate ? Number(item.interestRate) : undefined} />
        </div>
        <div className="space-y-1">
          <Label>Institution</Label>
          <Input name="institution" placeholder="e.g. Chase" defaultValue={item?.institution || undefined} />
        </div>
      </div>
      <Button type="submit" disabled={isPending} className="w-full">
        {isPending ? (item ? "Saving..." : "Adding...") : (item ? "Save Changes" : "Add Cash Account")}
      </Button>
    </form>
  );
}

// --- Debt Form ---
function DebtForm({
  item,
  onSuccess,
  properties,
  vehicles,
}: {
  item?: DebtItem;
  onSuccess: () => void;
  properties: RealEstateItem[];
  vehicles: VehicleItem[];
}) {
  const [error, formAction, isPending] = useActionState(
    async (_prev: string | null, formData: FormData) => {
      try {
        if (item) {
          await updateDebt(item.id, formData);
        } else {
          await createDebt(formData);
        }
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
          <Select name="owner" defaultValue={item?.owner || "self"}>
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
          <Select name="debtType" defaultValue={item?.debtType || "mortgage"}>
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
        <Input name="name" defaultValue={item?.name} placeholder="e.g. Primary Mortgage" required />
      </div>
      {/* What the loan is secured against.
          A car or a house also carries its own loan figure, typed onto the
          asset. Naming the asset here makes this balance the one that counts
          and retires the typed figure — without it, both are subtracted and
          the household's net worth is understated by the loan. */}
      {(properties.length > 0 || vehicles.length > 0) && (
        <div className="space-y-1">
          <Label>Secured against (optional)</Label>
          <Select
            name="securedBy"
            defaultValue={
              item?.securedByType && item?.securedById
                ? `${item.securedByType}:${item.securedById}`
                : "none"
            }
          >
            <SelectTrigger data-testid="secured-by"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Not secured against an asset</SelectItem>
              {properties.map((p) => (
                <SelectItem key={p.id} value={`real_estate:${p.id}`}>
                  {p.name} — property
                </SelectItem>
              ))}
              {vehicles.map((v) => (
                <SelectItem key={v.id} value={`vehicle:${v.id}`}>
                  {v.name} — vehicle
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            This balance then becomes the amount owed on that asset, in place of
            the loan figure stored on the asset itself.
          </p>
        </div>
      )}
      <div className="grid grid-cols-3 gap-4">
        <div className="space-y-1">
          <Label>Balance ($)</Label>
          <Input name="currentBalance" type="number" step="0.01" placeholder="280000"
            defaultValue={item ? Number(item.currentBalance) : undefined} required />
        </div>
        <div className="space-y-1">
          <Label>Rate (%)</Label>
          <Input name="interestRate" type="number" step="0.01" placeholder="6.5"
            defaultValue={item ? Number(item.interestRate) : undefined} required />
        </div>
        <div className="space-y-1">
          <Label>Monthly ($)</Label>
          <Input name="monthlyPayment" type="number" step="0.01" placeholder="2100"
            defaultValue={item ? Number(item.monthlyPayment) : undefined} required />
        </div>
      </div>
      <div className="space-y-1">
        <Label>Estimated Payoff Date</Label>
        <Input name="payoffDate" type="date" defaultValue={item?.payoffDate || undefined} />
        <p className="text-xs text-muted-foreground">When will this be paid off? Helps retirement projections.</p>
      </div>
      <Button type="submit" disabled={isPending} className="w-full">
        {isPending ? (item ? "Saving..." : "Adding...") : (item ? "Save Changes" : "Add Debt")}
      </Button>
    </form>
  );
}

// --- Vehicle Form ---
function VehicleForm({
  item,
  onSuccess,
  linkedLoan,
}: {
  item?: VehicleItem;
  onSuccess: () => void;
  linkedLoan?: AssetLoanView["loan"];
}) {
  const [vin, setVin] = useLocalState(item?.vin || "");
  const [vinLoading, setVinLoading] = useLocalState(false);
  const [vinResult, setVinResult] = useLocalState<string | null>(null);
  const [year, setYear] = useLocalState(item?.year ? String(item.year) : "");
  const [make, setMake] = useLocalState(item?.make || "");
  const [model, setModel] = useLocalState(item?.model || "");
  const [trim, setTrim] = useLocalState(item?.trim || "");
  const [vehicleType, setVehicleType] = useLocalState(item?.vehicleType || "car");
  const [hasLoan, setHasLoan] = useLocalState(item?.hasLoan ?? false);

  const [error, formAction, isPending] = useActionState(
    async (_prev: string | null, formData: FormData) => {
      try {
        const input = {
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
        };
        if (item) {
          await updateVehicle(item.id, input);
        } else {
          await addVehicle(input);
        }
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
    <form action={formAction} className="space-y-4 max-h-[70dvh] overflow-y-auto pr-1">
      {error && <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
      <div className="space-y-1">
        <Label>VIN (optional — auto-fills year/make/model)</Label>
        <div className="flex gap-2">
          <Input value={vin} onChange={(e) => setVin(e.target.value.toUpperCase())}
            placeholder="1HGCG5655WA..." className="font-mono text-xs" />
          <Button type="button" variant="outline" size="sm" onClick={handleVinDecode} disabled={vinLoading}>
            <Search className="mr-1 h-3.5 w-3.5" />{vinLoading ? "..." : "Decode"}
          </Button>
        </div>
        {vinResult && <p className="text-xs text-muted-foreground">{vinResult}</p>}
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <Label>Owner</Label>
          <Select name="owner" defaultValue={item?.owner || "self"}>
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
          <Input value={trim} onChange={(e) => setTrim(e.target.value)} placeholder="TRD" />
        </div>
      </div>
      <div className="space-y-1">
        <Label>Name</Label>
        <Input name="name" defaultValue={item?.name || autoName} placeholder={autoName || "2022 Toyota Tacoma"} />
        <p className="text-xs text-muted-foreground">How you want this shown in your dashboard</p>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div className="space-y-1">
          <Label>Mileage</Label>
          <Input name="mileage" type="number" placeholder="45000" defaultValue={item?.mileage ?? undefined} />
        </div>
        <div className="space-y-1">
          <Label>Condition</Label>
          <Select name="condition" defaultValue={item?.condition || "good"}>
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
          <Input name="purchasePrice" type="number" step="1" placeholder="35000"
            defaultValue={item?.purchasePrice ? Number(item.purchasePrice) : undefined} />
        </div>
      </div>
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <Label>Current Market Value ($)</Label>
          <a href={valUrl.url} target="_blank" rel="noopener noreferrer"
            className="text-xs text-primary hover:underline flex items-center gap-1">
            <ExternalLink className="h-3 w-3" />Look up on {valUrl.label}
          </a>
        </div>
        <Input name="estimatedValue" type="number" step="1" placeholder="28000"
          defaultValue={item ? Number(item.estimatedValue) : undefined} required />
      </div>
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
            {linkedLoan?.from && (
              <p className="text-xs text-amber-600 dark:text-amber-500">
                Currently showing {formatCurrency(linkedLoan.balance)} from{" "}
                <span className="font-mono">{linkedLoan.from.name}</span>, which
                updates on its own. Anything entered here is kept but not used
                while that debt is linked.
              </p>
            )}
            <Input name="loanBalance" type="number" step="0.01" placeholder="18000"
              defaultValue={item?.loanBalance ? Number(item.loanBalance) : undefined} required />
          </div>
          <div className="space-y-1">
            <Label>Interest Rate (%)</Label>
            <Input name="loanRate" type="number" step="0.01" placeholder="5.9"
              defaultValue={item?.loanRate ? Number(item.loanRate) : undefined} />
          </div>
          <div className="space-y-1">
            <Label>Monthly Payment ($)</Label>
            <Input name="loanMonthlyPayment" type="number" step="0.01" placeholder="450"
              defaultValue={item?.loanMonthlyPayment ? Number(item.loanMonthlyPayment) : undefined} />
          </div>
          <div className="space-y-1">
            <Label>Months Remaining</Label>
            <Input name="loanRemainingMonths" type="number" placeholder="36"
              defaultValue={item?.loanRemainingMonths ?? undefined} />
          </div>
        </div>
      )}
      <Button type="submit" disabled={isPending} className="w-full">
        {isPending ? (item ? "Saving..." : "Adding...") : (item ? "Save Changes" : "Add Vehicle")}
      </Button>
    </form>
  );
}
