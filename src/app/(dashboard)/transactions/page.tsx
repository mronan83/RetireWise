import { getAuthContext, withHousehold } from "@/lib/auth-helpers";
import { eq, desc } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { transactions, accounts } from "@/lib/db/schema";
import { TRANSACTION_TYPE_LABELS, ACCOUNT_OWNER_LABELS } from "@/lib/constants";
import { formatCurrency, formatDate } from "@/lib/utils/format";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ArrowUpRight, ArrowDownRight, Minus } from "lucide-react";
import { SyncNowButton } from "@/components/plaid/sync-now-button";

function TransactionIcon({ type }: { type: string }) {
  switch (type) {
    case "buy":
    case "contribution":
      return <ArrowDownRight className="h-4 w-4 text-green-500" />;
    case "sell":
    case "withdrawal":
    case "fee":
      return <ArrowUpRight className="h-4 w-4 text-red-500" />;
    default:
      return <Minus className="h-4 w-4 text-muted-foreground" />;
  }
}

export default async function TransactionsPage() {
  return withHousehold(() => TransactionsPageContent());
}

async function TransactionsPageContent() {
  const { dataClerkId: userId } = await getAuthContext();

  const db = getDb();
  const txns = await db
    .select({
      id: transactions.id,
      type: transactions.type,
      ticker: transactions.ticker,
      shares: transactions.shares,
      pricePerShare: transactions.pricePerShare,
      amount: transactions.amount,
      date: transactions.date,
      description: transactions.description,
      accountName: accounts.name,
      accountOwner: accounts.owner,
      accountType: accounts.accountType,
      dataSource: transactions.dataSource,
    })
    .from(transactions)
    .innerJoin(accounts, eq(transactions.accountId, accounts.id))
    .where(eq(accounts.clerkId, userId))
    .orderBy(desc(transactions.date))
    .limit(500);

  const coverage =
    txns.length > 0
      ? { earliest: txns[txns.length - 1].date, latest: txns[0].date }
      : null;

  // Summary stats
  const totalBuys = txns
    .filter((t) => t.type === "buy" || t.type === "contribution")
    .reduce((s, t) => s + Math.abs(Number(t.amount)), 0);
  const totalSells = txns
    .filter((t) => t.type === "sell" || t.type === "withdrawal")
    .reduce((s, t) => s + Math.abs(Number(t.amount)), 0);
  const totalDividends = txns
    .filter((t) => t.type === "dividend")
    .reduce((s, t) => s + Math.abs(Number(t.amount)), 0);
  const totalFees = txns
    .filter((t) => t.type === "fee")
    .reduce((s, t) => s + Math.abs(Number(t.amount)), 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Transactions</h1>
          <p className="text-muted-foreground">
            Buys, sales, dividends and fees across all household accounts
          </p>
          {/* The window, stated. Plaid returns at most two years before an
              institution was linked, so a reader looking for a purchase from
              2019 should be told why it is not here rather than conclude it
              never happened. */}
          {coverage && (
            <p className="mt-1 text-xs text-muted-foreground">
              {formatDate(coverage.earliest)} to {formatDate(coverage.latest)} ·{" "}
              {txns.length}
              {txns.length === 500 ? "+ (most recent 500)" : ""} recorded.
              Linked institutions report up to two years before they were
              connected.
            </p>
          )}
        </div>
        <SyncNowButton className="shrink-0" />
      </div>

      {txns.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs text-muted-foreground font-medium">
                Purchases / Contributions
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-lg font-bold font-mono text-green-500">
                {formatCurrency(totalBuys)}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs text-muted-foreground font-medium">
                Sales / Withdrawals
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-lg font-bold font-mono text-red-500">
                {formatCurrency(totalSells)}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs text-muted-foreground font-medium">
                Dividends Received
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-lg font-bold font-mono">
                {formatCurrency(totalDividends)}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs text-muted-foreground font-medium">
                Fees
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-lg font-bold font-mono text-muted-foreground">
                {formatCurrency(totalFees)}
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {txns.length === 0 ? (
        <div className="flex min-h-[260px] flex-col items-center justify-center rounded-lg border border-dashed p-8 text-center">
          <p className="font-medium">No transactions recorded yet</p>
          {/* This used to read "coming soon ... when Plaid transaction
              syncing is fully implemented". It is implemented; what is
              actually true is that nothing has been pulled yet, or that the
              institutions reported nothing. Those are different and the
              reader can act on the first. */}
          <p className="mt-2 max-w-md text-sm text-muted-foreground">
            Sync pulls buys, sales, dividends and fees from each linked
            institution, going back up to two years before it was connected.
            Employer plan record-keepers often report none — the sync says so
            per institution rather than leaving you to guess.
          </p>
          <div className="mt-5">
            <SyncNowButton />
          </div>
        </div>
      ) : (
        <div className="rounded-lg border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10"></TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Ticker</TableHead>
                <TableHead className="hidden lg:table-cell text-right">Shares</TableHead>
                <TableHead className="hidden lg:table-cell text-right">Price</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead className="hidden sm:table-cell">Account</TableHead>
                <TableHead className="hidden sm:table-cell">Owner</TableHead>
                <TableHead className="hidden md:table-cell">
                  Description
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {txns.map((txn) => (
                <TableRow key={txn.id}>
                  <TableCell>
                    <TransactionIcon type={txn.type} />
                  </TableCell>
                  <TableCell className="font-mono text-sm">
                    {formatDate(txn.date)}
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="text-xs">
                      {TRANSACTION_TYPE_LABELS[txn.type] || txn.type}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-mono font-medium">
                    {txn.ticker || "—"}
                  </TableCell>
                  <TableCell className="hidden lg:table-cell text-right font-mono text-muted-foreground tabular-nums">
                    {txn.shares === null ? "—" : Number(txn.shares).toFixed(4)}
                  </TableCell>
                  <TableCell className="hidden lg:table-cell text-right font-mono text-muted-foreground tabular-nums">
                    {txn.pricePerShare === null
                      ? "—"
                      : formatCurrency(Number(txn.pricePerShare))}
                  </TableCell>
                  <TableCell className="text-right font-mono tabular-nums">
                    {formatCurrency(Number(txn.amount))}
                  </TableCell>
                  <TableCell className="hidden sm:table-cell text-muted-foreground">
                    {txn.accountName}
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">
                    <Badge
                      variant={
                        txn.accountOwner === "spouse" ? "default" : "secondary"
                      }
                      className="text-xs"
                    >
                      {ACCOUNT_OWNER_LABELS[txn.accountOwner]}
                    </Badge>
                  </TableCell>
                  <TableCell className="hidden md:table-cell max-w-[200px] truncate text-muted-foreground">
                    {txn.description || "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
