import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getApiUserId, withApiHousehold } from "@/lib/auth-helpers";
import { getPlaidClient } from "@/lib/plaid/client";
import { encryptToken } from "@/lib/plaid/encryption";
import { syncPlaidBalances, syncPlaidItem } from "@/lib/plaid/sync";
import { getDb } from "@/lib/db";
import { plaidItems } from "@/lib/db/schema";

export async function POST(request: Request) {
  return withApiHousehold(() => handlePost(request));
}

async function handlePost(request: Request) {
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

  // An institution carries some products and not others: a bank has balances
  // and no holdings, a brokerage the reverse. Asking each for what it does not
  // have is expected and must not be read as the link failing — settling them
  // independently is the difference between "your balance is in" and an error
  // message on top of a row that imported correctly.
  const [holdings, balances] = await Promise.allSettled([
    syncPlaidItem({ client, clerkId: userId, itemId, accessToken, institutionName }),
    syncPlaidBalances({ client, clerkId: userId, itemId, accessToken, institutionName }),
  ]);

  if (holdings.status === "rejected") {
    console.error("Holdings sync failed for", itemId, holdings.reason);
  }
  if (balances.status === "rejected") {
    console.error("Balance sync failed for", itemId, balances.reason);
  }

  revalidatePath("/dashboard");
  revalidatePath("/accounts");
  revalidatePath("/holdings");
  revalidatePath("/net-worth");

  const imported = {
    ...(holdings.status === "fulfilled" ? holdings.value : {}),
    ...(balances.status === "fulfilled" ? balances.value : {}),
  };
  const anythingImported = Object.values(imported).some((n) => Number(n) > 0);

  // Only a link that brought nothing back at all is worth flagging. Anything
  // else is a normal partial result and the numbers say what landed.
  if (!anythingImported) {
    return Response.json(
      {
        success: true,
        ...imported,
        error:
          "Account linked, but nothing was imported yet. The nightly refresh will try again.",
      },
      { status: 207 }
    );
  }

  return Response.json({ success: true, ...imported });
}
