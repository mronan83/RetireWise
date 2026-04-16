import Papa from "papaparse";

export type ParsedHolding = {
  ticker: string;
  name: string;
  shares: number;
  costBasisPerShare: number;
  currentPrice: number;
  assetClass: string;
};

export function parseFidelityCSV(csvText: string): ParsedHolding[] {
  const result = Papa.parse(csvText, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  });

  const holdings: ParsedHolding[] = [];

  for (const row of result.data as Record<string, string>[]) {
    // Fidelity CSV columns: Symbol, Description, Quantity, Last Price, Current Value, Cost Basis Total, etc.
    const ticker =
      row["Symbol"]?.trim() ||
      row["symbol"]?.trim() ||
      row["Ticker"]?.trim();
    const name =
      row["Description"]?.trim() ||
      row["Security Description"]?.trim() ||
      row["Name"]?.trim() ||
      row["name"]?.trim();
    const sharesStr =
      row["Quantity"]?.trim() ||
      row["Shares"]?.trim() ||
      row["shares"]?.trim();
    const priceStr =
      row["Last Price"]?.trim() ||
      row["Current Price"]?.trim() ||
      row["Price"]?.trim() ||
      row["price"]?.trim();
    const costBasisStr =
      row["Cost Basis Per Share"]?.trim() ||
      row["Average Cost Basis"]?.trim();
    const costBasisTotalStr =
      row["Cost Basis Total"]?.trim() || row["Cost Basis"]?.trim();

    if (!ticker || !sharesStr || ticker === "Pending Activity") continue;

    const shares = parseFloat(sharesStr.replace(/[$,]/g, ""));
    const currentPrice = parseFloat((priceStr || "0").replace(/[$,]/g, ""));

    let costBasisPerShare = 0;
    if (costBasisStr) {
      costBasisPerShare = parseFloat(costBasisStr.replace(/[$,]/g, ""));
    } else if (costBasisTotalStr && shares > 0) {
      costBasisPerShare =
        parseFloat(costBasisTotalStr.replace(/[$,]/g, "")) / shares;
    }

    if (isNaN(shares) || shares === 0) continue;

    holdings.push({
      ticker: ticker.replace(/\*+$/, ""),
      name: name || ticker,
      shares,
      costBasisPerShare: isNaN(costBasisPerShare) ? 0 : costBasisPerShare,
      currentPrice: isNaN(currentPrice) ? 0 : currentPrice,
      assetClass: guessAssetClass(ticker, name),
    });
  }

  return holdings;
}

export function parseGenericCSV(csvText: string): ParsedHolding[] {
  const result = Papa.parse(csvText, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim().toLowerCase(),
  });

  const holdings: ParsedHolding[] = [];

  for (const row of result.data as Record<string, string>[]) {
    const ticker = row["ticker"] || row["symbol"];
    const name = row["name"] || row["description"] || ticker;
    const shares = parseFloat(
      (row["shares"] || row["quantity"] || "0").replace(/[$,]/g, "")
    );
    const currentPrice = parseFloat(
      (row["price"] || row["current price"] || row["last price"] || "0").replace(/[$,]/g, "")
    );
    const costBasis = parseFloat(
      (row["cost basis"] || row["cost basis per share"] || row["avg cost"] || "0").replace(/[$,]/g, "")
    );

    if (!ticker || isNaN(shares) || shares === 0) continue;

    holdings.push({
      ticker: ticker.toUpperCase().trim(),
      name: name?.trim() || ticker,
      shares,
      costBasisPerShare: isNaN(costBasis) ? 0 : costBasis,
      currentPrice: isNaN(currentPrice) ? 0 : currentPrice,
      assetClass: guessAssetClass(ticker, name),
    });
  }

  return holdings;
}

function guessAssetClass(ticker: string, name?: string): string {
  const t = ticker.toUpperCase();
  const n = (name || "").toLowerCase();

  // Bond funds
  if (
    /^(BND|AGG|VBTLX|FXNAX|TLT|IEF|SHY|TIPS|SCHZ|MUB)$/i.test(t) ||
    n.includes("bond") ||
    n.includes("fixed income") ||
    n.includes("treasury")
  ) {
    return "bond";
  }

  // International
  if (
    /^(VXUS|IXUS|FZILX|FTIHX|FSPSX|EFA|EEM|VEA|VWO|IEFA)$/i.test(t) ||
    n.includes("international") ||
    n.includes("foreign") ||
    n.includes("emerging") ||
    n.includes("ex-us")
  ) {
    return "intl_stock";
  }

  // REITs
  if (
    /^(VNQ|VGSLX|FREL|SCHH|IYR|XLRE)$/i.test(t) ||
    n.includes("reit") ||
    n.includes("real estate")
  ) {
    return "reit";
  }

  // Cash / Money market
  if (
    /^(SPAXX|FDRXX|FMPXX|VMFXX|SWVXX)$/i.test(t) ||
    n.includes("money market") ||
    n.includes("cash") ||
    n.includes("government mmkt")
  ) {
    return "cash";
  }

  // Crypto
  if (
    /^(BTC|ETH|GBTC|ETHE|IBIT|FBTC)$/i.test(t) ||
    n.includes("bitcoin") ||
    n.includes("crypto") ||
    n.includes("ethereum")
  ) {
    return "crypto";
  }

  // Commodity
  if (
    /^(GLD|IAU|SLV|USO|DBC|PDBC)$/i.test(t) ||
    n.includes("gold") ||
    n.includes("commodity") ||
    n.includes("silver")
  ) {
    return "commodity";
  }

  // Default: US stock
  return "us_stock";
}
