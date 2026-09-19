import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getApiUserId } from "@/lib/auth-helpers";
import { getPlaidClient } from "@/lib/plaid/client";
import { encryptToken } from "@/lib/plaid/encryption";
import { syncPlaidBalances, syncPlaidItem } from "@/lib/plaid/sync";
import { getDb } from "@/lib/db";
import { plaidItems } from "@/lib/db/schema";

export async function POST(request: Request) {
  // Linked accounts belong to the household, not the individual login.
  const userId = await getApiUserId();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { public_token, institution } = await request.json();
  const client = getPlaidClient();

  const exchangeResponse = await client.itemPublicTokenExchange({
    public_token,
  });

  const accessToken = exchangeResponse.data.access_token;
  const itemId = exchangeResponse.data.item_id;
  const institutionName = institution?.name || "Unknown";

  const db = getDb();

  // Relinking an institution issues a new access token for the same item id.
  // Storing a second row would leave the cron refreshing through a stale
  // token, so the existing row is updated in place.
  const [existingItem] = await db
    .select({ id: plaidItems.id })
    .from(plaidItems)
    .where(and(eq(plaidItems.clerkId, userId), eq(plaidItems.itemId, itemId)))
    .limit(1);

  if (existingItem) {
    await db
      .update(plaidItems)
      .set({
        accessTokenEncrypted: encryptToken(accessToken),
        institutionName,
        status: "active",
        lastSync: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(plaidItems.id, existingItem.id));
  } else {
    await db.insert(plaidItems).values({
      clerkId: userId,
      itemId,
      accessTokenEncrypted: encryptToken(accessToken),
      institutionName,
      status: "active",
      lastSync: new Date(),
    });
  }

  try {
    // An institution can carry both — a brokerage with a cash sweep, a bank
    // with a mortgage — so both run and each skips what it does not find.
    const [holdingCounts, balanceCounts] = await Promise.all([
      syncPlaidItem({ client, clerkId: userId, itemId, accessToken, institutionName }),
      syncPlaidBalances({ client, clerkId: userId, itemId, accessToken, institutionName }),
    ]);

    revalidatePath("/dashboard");
    revalidatePath("/accounts");
    revalidatePath("/holdings");
    revalidatePath("/net-worth");

    return Response.json({ success: true, ...holdingCounts, ...balanceCounts });
  } catch (e) {
    // The item is linked either way; holdings can be picked up by the nightly
    // refresh. Say so rather than reporting a clean success the UI can't tell
    // apart from an import that actually landed.
    console.error("Failed to sync holdings:", e);
    revalidatePath("/accounts");
    return Response.json(
      {
        success: true,
        holdingsSynced: false,
        error: "Account linked, but holdings could not be imported yet.",
      },
      { status: 207 }
    );
  }
}
