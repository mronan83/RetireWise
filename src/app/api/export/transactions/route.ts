import { getApiUserId } from "@/lib/auth-helpers";
import { eq, desc } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { transactions, accounts } from "@/lib/db/schema";

export async function GET() {
  const userId = await getApiUserId();
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const db = getDb();
  const txns = await db
    .select({
      date: transactions.date,
      type: transactions.type,
      ticker: transactions.ticker,
      shares: transactions.shares,
      pricePerShare: transactions.pricePerShare,
      amount: transactions.amount,
      description: transactions.description,
      accountName: accounts.name,
      accountOwner: accounts.owner,
    })
    .from(transactions)
    .innerJoin(accounts, eq(transactions.accountId, accounts.id))
    .where(eq(accounts.clerkId, userId))
    .orderBy(desc(transactions.date));

  const header = "Date,Type,Ticker,Shares,Price/Share,Amount,Account,Owner,Description\n";
  const rows = txns.map((t) =>
    [
      t.date,
      t.type,
      t.ticker || "",
      t.shares || "",
      t.pricePerShare || "",
      t.amount,
      `"${t.accountName}"`,
      t.accountOwner,
      `"${(t.description || "").replace(/"/g, '""')}"`,
    ].join(",")
  );

  const csv = header + rows.join("\n");

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="retirewise-transactions-${new Date().toISOString().split("T")[0]}.csv"`,
    },
  });
}
