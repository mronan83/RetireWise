import { getAuthContext } from "@/lib/auth-helpers";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { realEstate, cashReserves, debts, vehicles } from "@/lib/db/schema";
import { getHoldingsByClerkId } from "@/lib/queries/holdings";
import { getNetWorthSnapshots, getItemHistoryMap } from "@/lib/queries/snapshots";
import { snapshotNetWorth } from "@/lib/utils/net-worth-snapshot";
import { formatCurrency } from "@/lib/utils/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PlaidLinkButton } from "@/components/plaid/plaid-link-button";
import {
  TrendingUp,
  Home,
  CreditCard,
  PiggyBank,
  Car,
} from "lucide-react";
import { NetWorthForms } from "./net-worth-forms";
import { NetWorthHistoryChart } from "./net-worth-history-chart";
import { cn } from "@/lib/utils";

export default async function NetWorthPage() {
  const { dataClerkId: userId } = await getAuthContext();

  const db = getDb();
  const [holdings, properties, cash, debtsList, vehiclesList, nwSnapshots, itemHistoryMap] = await Promise.all([
    getHoldingsByClerkId(userId),
    db.select().from(realEstate).where(eq(realEstate.clerkId, userId)),
    db.select().from(cashReserves).where(eq(cashReserves.clerkId, userId)),
    db.select().from(debts).where(eq(debts.clerkId, userId)),
    db.select().from(vehicles).where(eq(vehicles.clerkId, userId)),
    getNetWorthSnapshots(userId),
    getItemHistoryMap(userId),
  ]);

  // Convert Map to plain object for client component props
  const historyRecord = Object.fromEntries(itemHistoryMap);

  // Seed today's snapshot if none exists for today (first visit of the day)
  const today = new Date().toISOString().split("T")[0];
  const hasTodaySnapshot = nwSnapshots.some((s) => s.snapshotDate === today);
  if (!hasTodaySnapshot) {
    snapshotNetWorth(userId).catch(() => {});
  }

  const investmentTotal = holdings.reduce((s, h) => s + Number(h.currentValue), 0);
  const realEstateTotal = properties.reduce((s, p) => s + Number(p.estimatedValue), 0);
  const realEstateEquity = properties.reduce(
    (s, p) => s + Number(p.estimatedValue) - Number(p.mortgageBalance || 0), 0
  );
  const cashTotal = cash.reduce((s, c) => s + Number(c.balance), 0);
  const debtTotal = debtsList.reduce((s, d) => s + Number(d.currentBalance), 0);
  const monthlyDebtPayments = debtsList.reduce((s, d) => s + Number(d.monthlyPayment), 0);
  const vehicleValue = vehiclesList.reduce((s, v) => s + Number(v.estimatedValue), 0);
  const vehicleLoanTotal = vehiclesList.reduce(
    (s, v) => s + (v.hasLoan ? Number(v.loanBalance || 0) : 0), 0
  );
  const vehicleEquity = vehicleValue - vehicleLoanTotal;
  const totalAssets = investmentTotal + realEstateEquity + cashTotal + vehicleEquity;
  const netWorth = totalAssets - debtTotal;

  // Shown so it is obvious which figures keep themselves current and which
  // are only as fresh as the last time someone typed them.
  const linkedCash = cash.filter((c) => c.plaidAccountId !== null).length;
  const linkedDebts = debtsList.filter((d) => d.plaidAccountId !== null).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Net Worth</h1>
          <p className="text-muted-foreground">Your complete household financial picture</p>
          {(linkedCash > 0 || linkedDebts > 0) && (
            <p className="mt-1 text-xs text-muted-foreground">
              {linkedCash > 0 && `${linkedCash} balance${linkedCash === 1 ? "" : "s"}`}
              {linkedCash > 0 && linkedDebts > 0 && " and "}
              {linkedDebts > 0 && `${linkedDebts} loan${linkedDebts === 1 ? "" : "s"}`}
              {" updating nightly. Property values are entered by hand."}
            </p>
          )}
        </div>
        {/* Banking is a separate Plaid product set from investments, so this
            is its own connection rather than a second use of the one on the
            accounts page. */}
        <PlaidLinkButton scope="banking" label="Connect bank or loan" />
      </div>

      {/* Summary cards */}
      <div className="grid gap-3 sm:gap-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
        <Card className="sm:col-span-2 lg:col-span-1 border-primary/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs text-muted-foreground font-medium">Net Worth</CardTitle>
          </CardHeader>
          <CardContent>
            <p className={cn("text-2xl font-bold font-mono", netWorth >= 0 ? "text-green-500" : "text-red-500")}>
              {formatCurrency(netWorth)}
            </p>
            <p className="text-xs text-muted-foreground mt-1">Assets - Debts</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-xs text-muted-foreground font-medium">Investments</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-lg font-bold font-mono">{formatCurrency(investmentTotal)}</p>
            <p className="text-xs text-muted-foreground">Live from portfolio</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-xs text-muted-foreground font-medium">Real Estate Equity</CardTitle>
            <Home className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-lg font-bold font-mono">{formatCurrency(realEstateEquity)}</p>
            <p className="text-xs text-muted-foreground">
              {formatCurrency(realEstateTotal)} value - {formatCurrency(realEstateTotal - realEstateEquity)} owed
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-xs text-muted-foreground font-medium">Cash Reserves</CardTitle>
            <PiggyBank className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-lg font-bold font-mono">{formatCurrency(cashTotal)}</p>
            <p className="text-xs text-muted-foreground">{cash.length} account{cash.length !== 1 ? "s" : ""}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-xs text-muted-foreground font-medium">Vehicles</CardTitle>
            <Car className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-lg font-bold font-mono">{formatCurrency(vehicleEquity)}</p>
            <p className="text-xs text-muted-foreground">
              {formatCurrency(vehicleValue)} value{vehicleLoanTotal > 0 ? ` - ${formatCurrency(vehicleLoanTotal)} owed` : ""}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-xs text-muted-foreground font-medium">Total Debts</CardTitle>
            <CreditCard className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-lg font-bold font-mono text-red-500">-{formatCurrency(debtTotal)}</p>
            <p className="text-xs text-muted-foreground">{formatCurrency(monthlyDebtPayments)}/mo payments</p>
          </CardContent>
        </Card>
      </div>

      {/* Breakdown bar */}
      {totalAssets > 0 && (
        <Card>
          <CardContent className="pt-6">
            <div className="flex h-6 rounded-full overflow-hidden">
              {investmentTotal > 0 && (
                <div className="bg-blue-500 transition-all"
                  style={{ width: `${(investmentTotal / totalAssets) * 100}%` }}
                  title={`Investments: ${formatCurrency(investmentTotal)}`} />
              )}
              {realEstateTotal > 0 && (
                <div className="bg-green-500 transition-all"
                  style={{ width: `${(realEstateTotal / totalAssets) * 100}%` }}
                  title={`Real Estate: ${formatCurrency(realEstateTotal)}`} />
              )}
              {cashTotal > 0 && (
                <div className="bg-yellow-500 transition-all"
                  style={{ width: `${(cashTotal / totalAssets) * 100}%` }}
                  title={`Cash: ${formatCurrency(cashTotal)}`} />
              )}
              {vehicleEquity > 0 && (
                <div className="bg-purple-500 transition-all"
                  style={{ width: `${(vehicleEquity / totalAssets) * 100}%` }}
                  title={`Vehicles: ${formatCurrency(vehicleEquity)}`} />
              )}
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-blue-500" />
                Investments ({((investmentTotal / totalAssets) * 100).toFixed(0)}%)
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-green-500" />
                Real Estate ({((realEstateEquity / totalAssets) * 100).toFixed(0)}%)
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-yellow-500" />
                Cash ({((cashTotal / totalAssets) * 100).toFixed(0)}%)
              </span>
              {vehicleEquity > 0 && (
                <span className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-purple-500" />
                  Vehicles ({((vehicleEquity / totalAssets) * 100).toFixed(0)}%)
                </span>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* History chart */}
      <NetWorthHistoryChart snapshots={nwSnapshots} />

      {/* Real Estate */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Home className="h-5 w-5 text-green-500" />
            Real Estate
          </CardTitle>
        </CardHeader>
        <CardContent>
          <NetWorthForms
            section="real_estate"
            properties={properties}
            cash={[]}
            debts={[]}
            vehicles={[]}
            historyRecord={historyRecord}
          />
        </CardContent>
      </Card>

      {/* Cash Reserves */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <PiggyBank className="h-5 w-5 text-yellow-500" />
            Cash Reserves
          </CardTitle>
        </CardHeader>
        <CardContent>
          <NetWorthForms
            section="cash"
            properties={[]}
            cash={cash}
            debts={[]}
            vehicles={[]}
            historyRecord={historyRecord}
          />
        </CardContent>
      </Card>

      {/* Vehicles */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Car className="h-5 w-5 text-purple-500" />
            Vehicles &amp; Recreation
          </CardTitle>
        </CardHeader>
        <CardContent>
          <NetWorthForms
            section="vehicle"
            properties={[]}
            cash={[]}
            debts={[]}
            vehicles={vehiclesList}
            historyRecord={historyRecord}
          />
        </CardContent>
      </Card>

      {/* Debts */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-red-500" />
            Debts
          </CardTitle>
        </CardHeader>
        <CardContent>
          <NetWorthForms
            section="debt"
            properties={[]}
            cash={[]}
            debts={debtsList}
            vehicles={[]}
            historyRecord={historyRecord}
          />
        </CardContent>
      </Card>
    </div>
  );
}
