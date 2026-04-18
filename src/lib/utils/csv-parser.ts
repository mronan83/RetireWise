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

/**
 * Parse QFX/OFX files (used by ADP myKplan, Schwab, and other brokerages).
 * QFX is SGML-based, not proper XML — tags aren't self-closing.
 *
 * ADP myKplan files use CUSIP numbers instead of ticker symbols.
 * We build a lookup from the SECLIST section first (CUSIP → ticker + name),
 * then match positions against it.
 */
export function parseQFX(text: string): ParsedHolding[] {
  const holdings: ParsedHolding[] = [];

  // Helper to extract a tag value from OFX SGML
  // OFX format: <TAGNAME>value\n (no closing tag for leaf nodes)
  function getTag(block: string, tag: string): string {
    const regex = new RegExp(`<${tag}>([^<\\r\\n]+)`, "i");
    const match = block.match(regex);
    return match ? match[1].trim() : "";
  }

  // Step 1: Build security lookup from SECLIST
  // SECLIST contains SECINFO blocks with UNIQUEID (CUSIP), SECNAME, and sometimes TICKER
  type SecInfo = { cusip: string; ticker: string; name: string };
  const secLookup = new Map<string, SecInfo>();

  // Match SECINFO blocks — they can be nested inside STOCKINFO, MFINFO, OTHERINFO, or standalone
  const secInfoPattern = /<SECINFO>([\s\S]*?)(?=<\/SECINFO>|<SECINFO>|<(?:STOCK|MF|OTHER)INFO>|<\/SECLIST>)/gi;
  let match;
  while ((match = secInfoPattern.exec(text)) !== null) {
    const block = match[1];
    const cusip = getTag(block, "UNIQUEID");
    const ticker = getTag(block, "TICKER");
    const name = getTag(block, "SECNAME");
    if (cusip) {
      secLookup.set(cusip.toUpperCase().trim(), {
        cusip: cusip.toUpperCase().trim(),
        ticker: ticker ? ticker.toUpperCase().trim() : "",
        name: name ? name.trim() : "",
      });
    }
  }

  // Also try broader pattern: some QFX files put SECNAME/TICKER at same level as UNIQUEID
  // without a wrapping SECINFO tag (e.g., directly inside STOCKINFO/MFINFO)
  const infoBlockPattern = /<(STOCKINFO|MFINFO|OTHERINFO)>([\s\S]*?)(?=<\/(STOCKINFO|MFINFO|OTHERINFO)>|<(STOCKINFO|MFINFO|OTHERINFO)>|<\/SECLIST>)/gi;
  while ((match = infoBlockPattern.exec(text)) !== null) {
    const block = match[2];
    const cusip = getTag(block, "UNIQUEID");
    const ticker = getTag(block, "TICKER");
    const name = getTag(block, "SECNAME");
    if (cusip && !secLookup.has(cusip.toUpperCase().trim())) {
      secLookup.set(cusip.toUpperCase().trim(), {
        cusip: cusip.toUpperCase().trim(),
        ticker: ticker ? ticker.toUpperCase().trim() : "",
        name: name ? name.trim() : "",
      });
    }
  }

  // Step 2: Extract positions from INVPOSLIST
  const positionPattern = /<(POSSTOCK|POSMF|POSOTHER|POSOPT)>([\s\S]*?)(?=<\/(POSSTOCK|POSMF|POSOTHER|POSOPT)>|<(POSSTOCK|POSMF|POSOTHER|POSOPT)>|<\/INVPOSLIST>)/gi;

  while ((match = positionPattern.exec(text)) !== null) {
    const block = match[2];

    const cusip = getTag(block, "UNIQUEID");
    if (!cusip) continue;

    const units = parseFloat(getTag(block, "UNITS") || "0");
    const unitPrice = parseFloat(getTag(block, "UNITPRICE") || "0");
    const mktVal = parseFloat(getTag(block, "MKTVAL") || "0");

    if (units === 0 && mktVal === 0) continue;

    const shares = isNaN(units) ? 0 : units;
    const price = isNaN(unitPrice) ? (shares > 0 && mktVal > 0 ? mktVal / shares : 0) : unitPrice;

    // Look up security info from SECLIST
    const secInfo = secLookup.get(cusip.toUpperCase().trim());
    const ticker = secInfo?.ticker || getTag(block, "TICKER") || cusip.toUpperCase().trim();
    const name = secInfo?.name || getTag(block, "SECNAME") || getTag(block, "MEMO") || "";

    holdings.push({
      ticker,
      name: name || ticker,
      shares,
      costBasisPerShare: 0, // QFX typically doesn't include cost basis
      currentPrice: price,
      assetClass: guessAssetClass(ticker, name),
      // Stash the CUSIP so the UI can show it for identification
      _cusip: cusip.toUpperCase().trim(),
    } as ParsedHolding & { _cusip?: string });
  }

  // Step 3: If no positions found, build holdings from SECLIST alone (some files only have this)
  if (holdings.length === 0) {
    for (const [, sec] of secLookup) {
      holdings.push({
        ticker: sec.ticker || sec.cusip,
        name: sec.name || sec.ticker || sec.cusip,
        shares: 0,
        costBasisPerShare: 0,
        currentPrice: 0,
        assetClass: guessAssetClass(sec.ticker || sec.cusip, sec.name),
      });
    }
  }

  return holdings;
}

/**
 * Detect whether a text blob is QFX/OFX format.
 */
export function isQFXFormat(text: string): boolean {
  return /(<OFX>|<OFXHEADER|OFXHEADER:)/i.test(text);
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
