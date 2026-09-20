import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/db";
import { plaidItems } from "@/lib/db/schema";
import { verifyPlaidWebhook } from "@/lib/plaid/webhook-verify";

export async function POST(request: Request) {
  // The raw body, before parsing: the signature covers these exact bytes, and
  // JSON.parse followed by JSON.stringify does not reproduce them.
  const rawBody = await request.text();

  const verified = await verifyPlaidWebhook(
    rawBody,
    request.headers.get("plaid-verification")
  );
  if (!verified.ok) {
    console.warn(`Rejected Plaid webhook: ${verified.reason}`);
    return Response.json({ error: "Invalid signature." }, { status: 401 });
  }

  let body: { webhook_type?: string; item_id?: string };
  try {
    body = JSON.parse(rawBody);
  } catch {
    return Response.json({ error: "Invalid body." }, { status: 400 });
  }

  const { webhook_type, item_id } = body;
  if (!item_id) return Response.json({ received: true });

  const db = getDb();

  if (webhook_type === "HOLDINGS" || webhook_type === "INVESTMENTS_TRANSACTIONS") {
    // Mark the item as having something new to fetch. The cron does the work.
    await db
      .update(plaidItems)
      .set({ updatedAt: new Date() })
      .where(eq(plaidItems.itemId, item_id));

    revalidatePath("/dashboard");
    revalidatePath("/holdings");
  }

  return Response.json({ received: true });
}
