import { getApiUserId } from "@/lib/auth-helpers";
import { revalidatePath } from "next/cache";
import { updateAllPrices } from "@/lib/utils/price-feed";

export async function POST() {
  const dataClerkId = await getApiUserId();
  if (!dataClerkId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await updateAllPrices(dataClerkId);

    revalidatePath("/dashboard");
    revalidatePath("/holdings");
    revalidatePath("/accounts");
    revalidatePath("/projections");
    revalidatePath("/analytics");
    revalidatePath("/net-worth");

    return Response.json({
      success: true,
      updated: result.updated,
      failed: result.failed,
      tickers: result.tickers,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Price update failed";
    console.error("Price refresh error:", e);
    return Response.json({ error: message, stack: String(e) }, { status: 500 });
  }
}
