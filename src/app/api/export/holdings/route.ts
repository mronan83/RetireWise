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
    const costBasis = Number(h.shares) * Number(h.costBasisPerShare);
    const value = Number(h.currentValue);
    const gainLoss = value - costBasis;
    return [
      h.ticker,
      `"${h.name}"`,
      h.assetClass,
      h.shares,
      h.costBasisPerShare,
      h.currentPrice,
      h.currentValue,
      gainLoss.toFixed(2),
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
