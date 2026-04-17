import { getAuthContext } from "@/lib/auth-helpers";
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
    })
    .from(transactions)
    .innerJoin(accounts, eq(transactions.accountId, accounts.id))
    .where(eq(accounts.clerkId, userId))
    .orderBy(desc(transactions.date))
    .limit(500);

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
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Transactions</h1>
        <p className="text-muted-foreground">
          Transaction history across all household accounts
        </p>
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
        <div className="flex h-[300px] flex-col items-center justify-center rounded-lg border border-dashed text-center">
          <p className="text-muted-foreground font-medium">Transaction tracking coming soon</p>
          <p className="text-sm text-muted-foreground mt-2 max-w-md">
            Transaction history will be available when Plaid transaction syncing
            is fully implemented. For now, use the Holdings and Dashboard pages
            to track your portfolio.
          </p>
        </div>
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10"></TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Ticker</TableHead>
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
                  <TableCell className="text-right font-mono">
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
