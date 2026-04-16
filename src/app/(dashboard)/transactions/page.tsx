import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { eq, desc } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { transactions, accounts } from "@/lib/db/schema";
import { TRANSACTION_TYPE_LABELS } from "@/lib/constants";
import { formatCurrency, formatDate } from "@/lib/utils/format";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export default async function TransactionsPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

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
    })
    .from(transactions)
    .innerJoin(accounts, eq(transactions.accountId, accounts.id))
    .where(eq(accounts.clerkId, userId))
    .orderBy(desc(transactions.date))
    .limit(200);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Transactions</h1>
        <p className="text-muted-foreground">
          Transaction history across all accounts
        </p>
      </div>

      {txns.length === 0 ? (
        <div className="flex h-[300px] items-center justify-center rounded-lg border border-dashed text-center text-muted-foreground">
          No transactions yet. Transactions will appear when you import data or
          connect accounts via Plaid.
        </div>
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Ticker</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead className="hidden sm:table-cell">Account</TableHead>
                <TableHead className="hidden md:table-cell">
                  Description
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {txns.map((txn) => (
                <TableRow key={txn.id}>
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
