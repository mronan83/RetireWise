import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { updateAllPrices } from "@/lib/utils/price-feed";

export async function POST() {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await updateAllPrices(userId);

    revalidatePath("/dashboard");
    revalidatePath("/holdings");
    revalidatePath("/accounts");

    return Response.json({
      success: true,
      updated: result.updated,
      failed: result.failed,
      tickers: result.tickers.length,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Price update failed";
    console.error("Price refresh error:", e);
    return Response.json({ error: message }, { status: 500 });
  }
}
