import { positionBasis } from "@/lib/utils/cost-basis";
import { getApiUserId, withApiHousehold } from "@/lib/auth-helpers";
import { getHoldingsByClerkId } from "@/lib/queries/holdings";

export async function GET() {
  return withApiHousehold(() => handleGet());
}

async function handleGet() {
  const userId = await getApiUserId();
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const holdings = await getHoldingsByClerkId(userId);


  const header = "Ticker,Name,Asset Class,Shares,Cost Basis/Share,Current Price,Current Value,Gain/Loss,Account,Owner\n";
  const rows = holdings.map((h) => {
    // An empty cell, not 0.00. Number(null) is 0, so a position whose
    // institution reported no cost basis exported as though it had cost
    // nothing — and the gain column claimed the entire position as profit.
    const costBasis = positionBasis(h);
    const value = Number(h.currentValue);
    const gainLoss = costBasis === null ? null : value - costBasis;
    return [
      h.ticker,
      `"${h.name}"`,
      h.assetClass,
      h.shares,
      h.costBasisPerShare ?? "",
      h.currentPrice,
      h.currentValue,
      gainLoss === null ? "" : gainLoss.toFixed(2),
      `"${h.accountName}"`,
      h.accountOwner,
    ].join(",");
  });

  const csv = header + rows.join("\n");

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="retirewise-holdings-${new Date().toISOString().split("T")[0]}.csv"`,
    },
  });
}
