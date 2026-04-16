import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/db";
import { plaidItems, accounts, holdings } from "@/lib/db/schema";
import { getPlaidClient } from "@/lib/plaid/client";
import { decryptToken } from "@/lib/plaid/encryption";

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = getDb();
  const client = getPlaidClient();

  const items = await db
    .select()
    .from(plaidItems)
    .where(eq(plaidItems.status, "active"));

  let refreshed = 0;
  let errors = 0;

  for (const item of items) {
    try {
      const accessToken = decryptToken(item.accessTokenEncrypted);

      const response = await client.investmentsHoldingsGet({
        access_token: accessToken,
      });

      const securities = new Map(
        response.data.securities.map((s) => [s.security_id, s])
      );

      // Update existing holdings prices
      for (const ph of response.data.holdings) {
        const security = securities.get(ph.security_id);
        if (!security) continue;

        const ticker = security.ticker_symbol || "UNKNOWN";
        const currentPrice = ph.institution_price || 0;

        // Find matching account
        const matchingAccounts = await db
          .select({ id: accounts.id })
          .from(accounts)
          .where(eq(accounts.plaidAccountId, ph.account_id))
          .limit(1);

        if (matchingAccounts.length === 0) continue;

        // Update holdings for this account/ticker
        const existingHoldings = await db
          .select()
          .from(holdings)
          .where(eq(holdings.accountId, matchingAccounts[0].id));

        const match = existingHoldings.find((h) => h.ticker === ticker);
        if (match) {
          await db
            .update(holdings)
            .set({
              shares: String(ph.quantity),
              currentPrice: String(currentPrice),
              currentValue: String(ph.quantity * currentPrice),
              lastPriceUpdate: new Date(),
              updatedAt: new Date(),
            })
            .where(eq(holdings.id, match.id));
        }
      }

      await db
        .update(plaidItems)
        .set({ lastSync: new Date(), updatedAt: new Date() })
        .where(eq(plaidItems.id, item.id));

      refreshed++;
    } catch (e) {
      console.error(`Failed to refresh item ${item.id}:`, e);
      errors++;
    }
  }

  revalidatePath("/dashboard");
  revalidatePath("/holdings");

  return Response.json({ success: true, refreshed, errors });
}
