import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/db";
import { plaidItems } from "@/lib/db/schema";

export async function POST(request: Request) {
  const body = await request.json();
  const { webhook_type, item_id } = body;

  // TODO: Add Plaid webhook verification (JWT-based) for production

  const db = getDb();

  if (
    webhook_type === "HOLDINGS" ||
    webhook_type === "INVESTMENTS_TRANSACTIONS"
  ) {
    // Mark item for refresh
    await db
      .update(plaidItems)
      .set({ updatedAt: new Date() })
      .where(eq(plaidItems.itemId, item_id));

    revalidatePath("/dashboard");
    revalidatePath("/holdings");
  }

  return Response.json({ received: true });
}
