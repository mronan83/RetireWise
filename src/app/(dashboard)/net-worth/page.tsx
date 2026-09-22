import { getAuthContext, withHousehold } from "@/lib/auth-helpers";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { realEstate, cashReserves, debts, vehicles } from "@/lib/db/schema";
import { getHoldingsByClerkId } from "@/lib/queries/holdings";
import { getNetWorthSnapshots, getItemHistoryMap } from "@/lib/queries/snapshots";
import { snapshotNetWorth } from "@/lib/utils/net-worth-snapshot";
import { formatCurrency } from "@/lib/utils/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PlaidLinkButton } from "@/components/plaid/plaid-link-button";
import { DuplicateCashReview, type DuplicatePair } from "./duplicate-cash-review";
import { SecuredDebtReview } from "./secured-debt-review";
import { loadNetWorth } from "@/lib/net-worth/load";
import { looksLikeSameLoan } from "@/lib/net-worth/compose";
import { normalizeName } from "@/lib/plaid/sync";
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
  return withHousehold(() => NetWorthPageContent());
}

async function NetWorthPageContent() {
  const { dataClerkId: userId, isDemo } = await getAuthContext();

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

  /**
   * Seed today's point if the nightly cron has not written one yet.
   *
   * Awaited. Started and abandoned, the write raced the response: the render
   * finished, the function was torn down, and the insert never landed — so
   * the chart's last point stayed on yesterday while the card beside it read
   * today, which looks exactly like the two disagreeing. One insert, at most
   * once a day.
   *
   * Not in demo mode: that household is read-only and, since the demo is
   * public, every visitor would otherwise trigger a write against it.
   */
  const today = new Date().toISOString().split("T")[0];
  const hasTodaySnapshot = nwSnapshots.some((s) => s.snapshotDate === today);
  if (!hasTodaySnapshot && !isDemo) {
    try {
      await snapshotNetWorth(userId);
    } catch (e) {
      // Swallowed silently before, so a chart stuck a day behind had no
      // trace anywhere explaining why.
      console.error(`Net worth snapshot failed for ${userId}:`, e);
    }
  }

  /**
   * Composed once, in src/lib/net-worth/compose.ts.
   *
   * What stood here netted each asset's own typed-in loan out of its equity
   * and then subtracted the whole debts table on top. A loan recorded in both
   * places — which is what a bank connection produces for a car already
   * entered by hand — came off twice.
   */
  const nw = await loadNetWorth(userId);

  const investmentTotal = nw.investments;
  const cashTotal = nw.cash;
  const realEstateTotal = nw.assets
    .filter((a) => a.kind === "real_estate")
    .reduce((s, a) => s + a.value, 0);
  const realEstateEquity = nw.assets
    .filter((a) => a.kind === "real_estate")
    .reduce((s, a) => s + a.equity, 0);
  const vehicleValue = nw.assets
    .filter((a) => a.kind === "vehicle")
    .reduce((s, a) => s + a.value, 0);
  const vehicleEquity = nw.assets
    .filter((a) => a.kind === "vehicle")
    .reduce((s, a) => s + a.equity, 0);
  // What is owed against the vehicles, from whichever record is authoritative
  // for each — the synced debt where one is linked, the typed figure where not.
  const vehicleLoanTotal = nw.assets
    .filter((a) => a.kind === "vehicle")
    .reduce((s, a) => s + a.owed, 0);
  /**
   * Every liability, secured or not.
   *
   * This card read `nw.unsecured` and was headed "Total Debts" — $12,836.07
   * of credit cards against $282,545.22 actually owed, because the mortgages
   * and the camper loan were netted out of the assets above and never
   * reappeared. Equity belongs on the asset it belongs to; it does not stop
   * the loan being a debt.
   */
  const debtTotal = nw.liabilities;
  const securedDebt = nw.secured;
  const unsecuredDebt = nw.unsecured;
  // Gross, to pair with an all-in debt figure: the six cards now read as a
  // balance sheet, and assets - debts lands on the headline exactly.
  const totalAssets = nw.grossAssets;
  const netWorth = nw.netWorth;
  const monthlyDebtPayments = debtsList.reduce((s, d) => s + Number(d.monthlyPayment), 0);

  // What each asset owes and is worth, keyed for the cards. They used to read
  // the asset's own loan column, which goes stale the moment a linked debt
  // syncs a new balance.
  const assetLoans = Object.fromEntries(
    nw.assets.map((a) => [
      a.id,
      { owed: a.owed, equity: a.equity, owedSource: a.owedSource, loan: a.loan },
    ])
  );

  // Shown so it is obvious which figures keep themselves current and which
  // are only as fresh as the last time someone typed them.
  const linkedCash = cash.filter((c) => c.plaidAccountId !== null).length;
  const linkedDebts = debtsList.filter((d) => d.plaidAccountId !== null).length;

  // A linked balance sitting beside a hand-entered one at the same institution
  // is the same money twice, and here it lands straight in the net worth
  // total. Names rarely match well enough to resolve this automatically.
  const duplicatePairs: DuplicatePair[] = [
    ...cash
      .filter((c) => c.plaidAccountId !== null)
      .flatMap((linked) =>
        cash
          .filter(
            (m) =>
              m.plaidAccountId === null &&
              normalizeName(m.institution) === normalizeName(linked.institution)
          )
          .map<DuplicatePair>((m) => ({
            kind: "cash",
            linkedId: linked.id,
            linkedName: linked.name,
            linkedValue: Number(linked.balance),
            manualId: m.id,
            manualName: m.name,
            manualValue: Number(m.balance),
            institution: linked.institution ?? "",
          }))
      ),
    /**
     * Debts that look like the same borrowing recorded twice.
     *
     * This used to pair any synced debt with any hand-entered debt of the
     * same `debt_type`. A $155,589.18 primary mortgage and a $34,114.38
     * second lien were therefore offered as duplicates of each other, every
     * visit, on the grounds that both are mortgages — a prompt with no
     * correct answer, since neither is a copy of the other.
     *
     * It now needs evidence: balances that agree to the cent, or names with
     * words in common. Same rule the asset-loan check uses.
     */
    ...debtsList
      .filter((d) => d.plaidAccountId !== null && !d.securedById)
      .flatMap((linked) =>
        debtsList
          .filter((m) => m.plaidAccountId === null && !m.securedById && m.debtType === linked.debtType)
          .flatMap<DuplicatePair>((m) => {
            const verdict = looksLikeSameLoan(
              { name: linked.name, balance: Number(linked.currentBalance) },
              { name: m.name, balance: Number(m.currentBalance) }
            );
            if (!verdict.same) return [];
            return [{
              kind: "debt",
              linkedId: linked.id,
              linkedName: linked.name,
              linkedValue: Number(linked.currentBalance),
              manualId: m.id,
              manualName: m.name,
              manualValue: Number(m.currentBalance),
              institution: linked.name,
            }];
          })
      ),
  ];

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

      {duplicatePairs.length > 0 && <DuplicateCashReview pairs={duplicatePairs} />}

      {/* A loan typed onto a car or a house, sitting beside a synced debt row
          that looks like the same borrowing. Surfaced rather than merged: only
          the owner knows whether two loans against one asset are one loan
          written twice or a genuine second lien. */}
      {nw.suspectedDuplicates.length > 0 && (
        <SecuredDebtReview duplicates={nw.suspectedDuplicates} />
      )}

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
            <CardTitle className="text-xs text-muted-foreground font-medium">Real Estate</CardTitle>
            <Home className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-lg font-bold font-mono">{formatCurrency(realEstateTotal)}</p>
            <p className="text-xs text-muted-foreground">
              {formatCurrency(realEstateEquity)} equity
              {realEstateTotal - realEstateEquity > 0
                ? ` · ${formatCurrency(realEstateTotal - realEstateEquity)} owed`
                : ""}
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
            <p className="text-lg font-bold font-mono">{formatCurrency(vehicleValue)}</p>
            <p className="text-xs text-muted-foreground">
              {formatCurrency(vehicleEquity)} equity
              {vehicleLoanTotal > 0 ? ` · ${formatCurrency(vehicleLoanTotal)} owed` : ""}
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
            <p className="text-xs text-muted-foreground">
              {securedDebt > 0
                ? `${formatCurrency(securedDebt)} secured · ${formatCurrency(unsecuredDebt)} unsecured`
                : `${formatCurrency(monthlyDebtPayments)}/mo payments`}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Breakdown bar */}
      {/* What is owned, by share of gross value. The segments used to be drawn
          from gross real estate and vehicle EQUITY over an equity-basis total,
          so the four of them summed past 100% and the last one ran off the
          end of the bar. One basis, all four. */}
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
              {vehicleValue > 0 && (
                <div className="bg-purple-500 transition-all"
                  style={{ width: `${(vehicleValue / totalAssets) * 100}%` }}
                  title={`Vehicles: ${formatCurrency(vehicleValue)}`} />
              )}
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-blue-500" />
                Investments ({((investmentTotal / totalAssets) * 100).toFixed(0)}%)
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-green-500" />
                Real Estate ({((realEstateTotal / totalAssets) * 100).toFixed(0)}%)
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-yellow-500" />
                Cash ({((cashTotal / totalAssets) * 100).toFixed(0)}%)
              </span>
              {vehicleValue > 0 && (
                <span className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-purple-500" />
                  Vehicles ({((vehicleValue / totalAssets) * 100).toFixed(0)}%)
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
            assetLoans={assetLoans}
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
            assetLoans={assetLoans}
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
            assetLoans={assetLoans}
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
          {/* The debt form offers "secured against", so it needs the assets
              to offer. Passed empty, the picker's own guard hid it and the
              linking feature could not be reached from anywhere in the app. */}
          <NetWorthForms
            section="debt"
            properties={properties}
            cash={[]}
            debts={debtsList}
            assetLoans={assetLoans}
            vehicles={vehiclesList}
            historyRecord={historyRecord}
          />
        </CardContent>
      </Card>
    </div>
  );
}
