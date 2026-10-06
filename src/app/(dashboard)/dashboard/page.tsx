import { Suspense } from "react";
import { getAuthContext } from "@/lib/auth-helpers";
import { PortfolioSummaryCards } from "@/components/dashboard/portfolio-summary-card";
import { AllocationChart } from "@/components/dashboard/allocation-chart";
import { PerformanceChart } from "@/components/dashboard/performance-chart";
import { HoldingsTable } from "@/components/dashboard/holdings-table";
import { AccountCard } from "@/components/dashboard/account-card";
import { Skeleton } from "@/components/ui/skeleton";
import { getAccountsWithFreshness } from "@/lib/queries/accounts";
import { getHoldingsByClerkId } from "@/lib/queries/holdings";
import { getSnapshots, getAccountPerformanceMap, getPreviousClose } from "@/lib/queries/snapshots";
import { dailyChange as dayChange, marketDay } from "@/lib/performance/daily-change";
import { calculatePortfolioSummary, calculateGainLoss } from "@/lib/utils/calculations";
import { gainLossFor, missingBasisNote, rollupBasis } from "@/lib/utils/cost-basis";
import { RefreshPricesButton } from "@/components/dashboard/refresh-prices-button";
import { GoalsPanel } from "@/components/dashboard/goals-panel";
import { getGoalsWithProgress, getLinkableItems } from "@/lib/queries/goals";
import { loadNetWorth } from "@/lib/net-worth/load";
import { ExportButtons } from "@/components/dashboard/export-buttons";
import { NetWorthCard } from "@/components/dashboard/net-worth-card";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { realEstate, cashReserves, debts, vehicles } from "@/lib/db/schema";
import { withHousehold } from "@/lib/auth-helpers";
import { redirect } from "next/navigation";
import { getOnboardingState } from "@/lib/onboarding";
import { oldestOf } from "@/lib/utils/freshness";
import { SetupBanner } from "./setup-banner";

async function DashboardContentScoped() {
  const { dataClerkId: userId } = await getAuthContext();

  // A household that has entered nothing gets a dashboard of zeros, which
  // reads as "you have no money" rather than "you have not started". Send
  // them to the checklist instead; every other state stays here.
  const setup = await getOnboardingState(userId);
  if (setup.empty) redirect("/onboarding");

  const db = getDb();
  const [accountsList, holdingsWithAccounts, snapshots, userGoals, linkableItems, netWorthFigures, properties, cashAccounts, debtsList, vehiclesList, periodReturnsMap] = await Promise.all([
    getAccountsWithFreshness(userId),
    getHoldingsByClerkId(userId),
    getSnapshots(userId, 90),
    // Each goal rolled up over its OWN linked accounts. It used to be the raw
    // rows, with the panel dividing the whole portfolio by each target — so
    // every goal drew the same bar.
    getGoalsWithProgress(userId),
    getLinkableItems(userId),
    loadNetWorth(userId),
    db.select().from(realEstate).where(eq(realEstate.clerkId, userId)),
    db.select().from(cashReserves).where(eq(cashReserves.clerkId, userId)),
    db.select().from(debts).where(eq(debts.clerkId, userId)),
    db.select().from(vehicles).where(eq(vehicles.clerkId, userId)),
    getAccountPerformanceMap(userId),
  ]);
  // Prices at the previous close, for the day's change at the latest prices.
  const previousClose = await getPreviousClose(userId, marketDay());

  const holdingsForCalc = holdingsWithAccounts.map((h) => ({
    ...h,
    lastPriceUpdate: h.lastPriceUpdate,
  }));

  const summary = calculatePortfolioSummary(holdingsForCalc);

  // The oldest price behind the total, not the newest: a total inherits the
  // staleness of its worst input, and reporting the freshest timestamp would
  // describe it as more current than it is.
  const pricesAsOf = oldestOf(holdingsWithAccounts.map((h) => h.lastPriceUpdate));

  // The day's change is worked out here, at the prices just loaded, so
  // Refresh Prices moves it. It was the evening snapshot's figure, which held
  // all day and counted money paid in as gain.
  const today = previousClose
    ? dayChange(
        holdingsWithAccounts.map((h) => ({
          accountId: h.accountId,
          ticker: h.ticker,
          shares: Number(h.shares),
          price: Number(h.currentPrice),
        })),
        previousClose.positions
      )
    : null;

  const holdingsTableData = holdingsWithAccounts.map((h) => {
    const gl = calculateGainLoss(h);
    return {
      id: h.id,
      ticker: h.ticker,
      name: h.name,
      assetClass: h.assetClass,
      shares: h.shares,
      costBasisPerShare: h.costBasisPerShare,
      costBasisSource: h.costBasisSource,
      currentPrice: h.currentPrice,
      currentValue: h.currentValue,
      accountName: h.accountName,
      gainLoss: gl?.gainLoss ?? null,
      gainLossPct: gl?.gainLossPct ?? null,
      lastPriceUpdate: h.lastPriceUpdate,
    };
  });

  const snapshotChartData = snapshots
    .map((s) => ({
      date: s.snapshotDate,
      value: Number(s.totalValue),
    }))
    .reverse();

  // Calculate total value + cost basis per account, and per owner
  // Holdings are kept per account rather than a running cost total: an
  // unreported basis is null, Number(null) is 0, and a summed 0 is
  // indistinguishable from a position that cost nothing. See cost-basis.ts.
  const accountData: Record<string, { value: number; holdings: typeof holdingsWithAccounts }> = {};
  const accountValues: Record<string, number> = {};
  let selfValue = 0;
  let spouseValue = 0;
  for (const h of holdingsWithAccounts) {
    const val = Number(h.currentValue);
    accountValues[h.accountId] = (accountValues[h.accountId] || 0) + val;
    const entry = accountData[h.accountId] || { value: 0, holdings: [] };
    entry.value += val;
    entry.holdings.push(h);
    accountData[h.accountId] = entry;
    if (h.accountOwner === "spouse") {
      spouseValue += val;
    } else {
      selfValue += val;
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <SetupBanner state={setup} />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground">
            Your household retirement portfolio
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:shrink-0">
          <ExportButtons />
          <RefreshPricesButton />
        </div>
      </div>

      {/* Composed once, in src/lib/net-worth/compose.ts. This block used to
          net each asset's own loan figure out of its equity and then subtract
          the debts table on top — so a loan recorded in both places came off
          twice. */}
      <NetWorthCard
        investmentTotal={netWorthFigures.investments}
        realEstateValue={netWorthFigures.assets
          .filter((a) => a.kind === "real_estate")
          .reduce((s, a) => s + a.value, 0)}
        cashTotal={netWorthFigures.cash}
        vehicleValue={netWorthFigures.assets
          .filter((a) => a.kind === "vehicle")
          .reduce((s, a) => s + a.value, 0)}
        debtTotal={netWorthFigures.liabilities}
      />

      <PortfolioSummaryCards
        totalValue={summary.totalValue}
        selfValue={selfValue}
        spouseValue={spouseValue}
        totalGainLoss={summary.totalGainLoss}
        totalGainLossPct={summary.totalGainLossPct}
        positionsWithoutBasis={summary.positionsWithoutBasis}
        dailyChange={today?.change ?? 0}
        dailyChangePct={today?.changePct ?? 0}
        dailyChangeSince={previousClose?.date ?? null}
        positionsNewSinceClose={today?.newSinceClose ?? 0}
        accountCount={accountsList.length}
        holdingCount={holdingsWithAccounts.length}
        pricesAsOf={pricesAsOf}
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <AllocationChart data={summary.allocation} />
        <PerformanceChart data={snapshotChartData} />
      </div>

      <GoalsPanel goals={userGoals} linkable={linkableItems} />

      {accountsList.length > 0 && (
        <div>
          <h2 className="mb-4 text-lg font-semibold">Accounts</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {accountsList.map((account) => {
              const data = accountData[account.id];
              const value = data?.value ?? 0;
              const rollup = rollupBasis(data?.holdings ?? []);
              const gl = gainLossFor(value, rollup.basis);
              return (
                <AccountCard
                  key={account.id}
                  account={account}
                  totalValue={value}
                  costBasis={gl?.costBasis}
                  gainLoss={gl?.gainLoss}
                  gainLossPct={gl?.gainLossPct}
                  missingBasisNote={missingBasisNote(rollup)}
                  periodReturns={periodReturnsMap.get(account.id)}
                  connection={account.connection}
                  valueAsOf={account.valueAsOf}
                  unpricedHoldings={account.unpricedHoldings}
                />
              );
            })}
          </div>
        </div>
      )}

      <div>
        <h2 className="mb-4 text-lg font-semibold">Holdings</h2>
        <HoldingsTable holdings={holdingsTableData} />
      </div>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div>
        <Skeleton className="h-8 w-48" />
        <Skeleton className="mt-2 h-4 w-64" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-[120px]" />
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Skeleton className="h-[350px]" />
        <Skeleton className="h-[350px]" />
      </div>
      <Skeleton className="h-[300px]" />
    </div>
  );
}

// The scope wraps the content rather than the page: the page itself renders a
// Suspense boundary synchronously and touches no data, while everything that
// queries lives under it.
async function DashboardContent() {
  return withHousehold(() => DashboardContentScoped());
}

export default function DashboardPage() {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <DashboardContent />
    </Suspense>
  );
}
