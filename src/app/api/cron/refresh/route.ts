import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/db";
import { plaidItems } from "@/lib/db/schema";
import { getPlaidClient } from "@/lib/plaid/client";
import { decryptToken } from "@/lib/plaid/encryption";
import { syncPlaidBalances, syncPlaidItem } from "@/lib/plaid/sync";

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
      // Same reconciliation the link step runs, scoped to the item's own
      // household. The previous version matched accounts by Plaid id alone
      // and only ever updated prices, so new positions never appeared and
      // sold ones never went away.
      const accessToken = decryptToken(item.accessTokenEncrypted);
      const shared = {
        client,
        clerkId: item.clerkId,
        itemId: item.itemId,
        accessToken,
        institutionName: item.institutionName,
      };
      await syncPlaidItem(shared);
      await syncPlaidBalances(shared);

      await db
        .update(plaidItems)
        .set({ lastSync: new Date(), status: "active", updatedAt: new Date() })
        .where(eq(plaidItems.id, item.id));

      refreshed++;
    } catch (e) {
      console.error(`Failed to refresh item ${item.id}:`, e);
      await db
        .update(plaidItems)
        .set({ status: "error", updatedAt: new Date() })
        .where(eq(plaidItems.id, item.id));
      errors++;
    }
  }

  revalidatePath("/dashboard");
  revalidatePath("/accounts");
  revalidatePath("/holdings");
  revalidatePath("/net-worth");

  return Response.json({ success: true, refreshed, errors });
}
