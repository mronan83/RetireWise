import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { realEstate, cashReserves, debts } from "@/lib/db/schema";
import { getHoldingsByClerkId } from "@/lib/queries/holdings";
import { formatCurrency } from "@/lib/utils/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  TrendingUp,
  Home,
  Landmark,
  CreditCard,
  PiggyBank,
} from "lucide-react";
import { ACCOUNT_OWNER_LABELS } from "@/lib/constants";
import { DEBT_TYPE_LABELS, CASH_TYPE_LABELS } from "@/lib/constants-net-worth";
import { NetWorthForms } from "./net-worth-forms";
import { cn } from "@/lib/utils";

export default async function NetWorthPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const db = getDb();
  const [holdings, properties, cash, debtsList] = await Promise.all([
    getHoldingsByClerkId(userId),
    db.select().from(realEstate).where(eq(realEstate.clerkId, userId)),
    db.select().from(cashReserves).where(eq(cashReserves.clerkId, userId)),
    db.select().from(debts).where(eq(debts.clerkId, userId)),
  ]);

  // Calculate totals
  const investmentTotal = holdings.reduce(
    (s, h) => s + Number(h.currentValue),
    0
  );
  const realEstateTotal = properties.reduce(
    (s, p) => s + Number(p.estimatedValue),
    0
  );
  const realEstateEquity = properties.reduce(
    (s, p) => s + Number(p.estimatedValue) - Number(p.mortgageBalance || 0),
    0
  );
  const cashTotal = cash.reduce((s, c) => s + Number(c.balance), 0);
  const debtTotal = debtsList.reduce(
    (s, d) => s + Number(d.currentBalance),
    0
  );
  const monthlyDebtPayments = debtsList.reduce(
    (s, d) => s + Number(d.monthlyPayment),
    0
  );

  const totalAssets = investmentTotal + realEstateTotal + cashTotal;
  const netWorth = totalAssets - debtTotal;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Net Worth</h1>
        <p className="text-muted-foreground">
          Your complete household financial picture
        </p>
      </div>

      {/* Summary */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Card className="sm:col-span-2 lg:col-span-1 border-primary/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs text-muted-foreground font-medium">
              Net Worth
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className={cn("text-2xl font-bold font-mono", netWorth >= 0 ? "text-green-500" : "text-red-500")}>
              {formatCurrency(netWorth)}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Assets - Debts
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-xs text-muted-foreground font-medium">
              Investments
            </CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-lg font-bold font-mono">
              {formatCurrency(investmentTotal)}
            </p>
            <p className="text-xs text-muted-foreground">Live from portfolio</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-xs text-muted-foreground font-medium">
              Real Estate Equity
            </CardTitle>
            <Home className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-lg font-bold font-mono">
              {formatCurrency(realEstateEquity)}
            </p>
            <p className="text-xs text-muted-foreground">
              {formatCurrency(realEstateTotal)} value - {formatCurrency(realEstateTotal - realEstateEquity)} owed
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-xs text-muted-foreground font-medium">
              Cash Reserves
            </CardTitle>
            <PiggyBank className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-lg font-bold font-mono">
              {formatCurrency(cashTotal)}
            </p>
            <p className="text-xs text-muted-foreground">
              {cash.length} account{cash.length !== 1 ? "s" : ""}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-xs text-muted-foreground font-medium">
              Total Debts
            </CardTitle>
            <CreditCard className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-lg font-bold font-mono text-red-500">
              -{formatCurrency(debtTotal)}
            </p>
            <p className="text-xs text-muted-foreground">
              {formatCurrency(monthlyDebtPayments)}/mo payments
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Breakdown bar */}
      {totalAssets > 0 && (
        <Card>
          <CardContent className="pt-6">
            <div className="flex h-6 rounded-full overflow-hidden">
              {investmentTotal > 0 && (
                <div
                  className="bg-blue-500 transition-all"
                  style={{ width: `${(investmentTotal / totalAssets) * 100}%` }}
                  title={`Investments: ${formatCurrency(investmentTotal)}`}
                />
              )}
              {realEstateTotal > 0 && (
                <div
                  className="bg-green-500 transition-all"
                  style={{ width: `${(realEstateTotal / totalAssets) * 100}%` }}
                  title={`Real Estate: ${formatCurrency(realEstateTotal)}`}
                />
              )}
              {cashTotal > 0 && (
                <div
                  className="bg-yellow-500 transition-all"
                  style={{ width: `${(cashTotal / totalAssets) * 100}%` }}
                  title={`Cash: ${formatCurrency(cashTotal)}`}
                />
              )}
            </div>
            <div className="flex gap-4 mt-2 text-xs text-muted-foreground">
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
            </div>
          </CardContent>
        </Card>
      )}

      {/* Real Estate */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Home className="h-5 w-5 text-green-500" />
            Real Estate
          </CardTitle>
        </CardHeader>
        <CardContent>
          {properties.length > 0 && (
            <div className="space-y-2 mb-4">
              {properties.map((p) => (
                <div key={p.id} className="flex items-center justify-between rounded-lg border p-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">{p.name}</span>
                      <Badge variant={p.owner === "spouse" ? "default" : "secondary"} className="text-xs">
                        {ACCOUNT_OWNER_LABELS[p.owner]}
                      </Badge>
                      {p.isPrimaryResidence && (
                        <Badge variant="outline" className="text-xs">Primary</Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Value: {formatCurrency(Number(p.estimatedValue))}
                      {Number(p.mortgageBalance) > 0 && (
                        <> | Mortgage: {formatCurrency(Number(p.mortgageBalance))}
                        {p.monthlyPayment && <> | {formatCurrency(Number(p.monthlyPayment))}/mo</>}
                        </>
                      )}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-mono font-medium text-sm text-green-500">
                      {formatCurrency(Number(p.estimatedValue) - Number(p.mortgageBalance || 0))}
                    </p>
                    <p className="text-xs text-muted-foreground">equity</p>
                  </div>
                </div>
              ))}
            </div>
          )}
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
          {cash.length > 0 && (
            <div className="space-y-2 mb-4">
              {cash.map((c) => (
                <div key={c.id} className="flex items-center justify-between rounded-lg border p-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">{c.name}</span>
                      <Badge variant={c.owner === "spouse" ? "default" : "secondary"} className="text-xs">
                        {ACCOUNT_OWNER_LABELS[c.owner]}
                      </Badge>
                      <Badge variant="outline" className="text-xs">
                        {CASH_TYPE_LABELS[c.accountType]}
                      </Badge>
                    </div>
                    {(c.institution || c.interestRate) && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {c.institution && <>{c.institution}</>}
                        {c.interestRate && <> | {Number(c.interestRate)}% APY</>}
                      </p>
                    )}
                  </div>
                  <p className="font-mono font-medium text-sm">
                    {formatCurrency(Number(c.balance))}
                  </p>
                </div>
              ))}
            </div>
          )}
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
          {debtsList.length > 0 && (
            <div className="space-y-2 mb-4">
              {debtsList.map((d) => (
                <div key={d.id} className="flex items-center justify-between rounded-lg border p-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">{d.name}</span>
                      <Badge variant={d.owner === "spouse" ? "default" : "secondary"} className="text-xs">
                        {ACCOUNT_OWNER_LABELS[d.owner]}
                      </Badge>
                      <Badge variant="outline" className="text-xs">
                        {DEBT_TYPE_LABELS[d.debtType]}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {Number(d.interestRate)}% rate | {formatCurrency(Number(d.monthlyPayment))}/mo
                      {d.payoffDate && <> | Payoff: {d.payoffDate}</>}
                    </p>
                  </div>
                  <p className="font-mono font-medium text-sm text-red-500">
                    {formatCurrency(Number(d.currentBalance))}
                  </p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add forms */}
      <NetWorthForms />
    </div>
  );
}
