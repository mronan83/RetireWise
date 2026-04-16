// eslint-disable-next-line @typescript-eslint/no-require-imports
const yahooFinance = require("yahoo-finance2").default;
import { eq } from "drizzle-orm";
import { getDb } from "../db";
import { holdings, accounts } from "../db/schema";

// Tickers that aren't real securities (money market, pending, etc.)
const SKIP_TICKERS = new Set([
  "SPAXX",
  "FDRXX",
  "FMPXX",
  "VMFXX",
  "SWVXX",
  "FCASH",
  "CORE",
  "Pending Activity",
]);

type PriceResult = {
  ticker: string;
  price: number | null;
  error?: string;
};

/**
 * Fetch current prices for a list of tickers via Yahoo Finance.
 * Batches requests and handles failures gracefully.
 */
export async function fetchPrices(tickers: string[]): Promise<Map<string, number>> {
  const prices = new Map<string, number>();
  const toFetch = tickers.filter((t) => !SKIP_TICKERS.has(t));

  // Fetch in batches of 20 to avoid rate limits
  const batchSize = 20;
  for (let i = 0; i < toFetch.length; i += batchSize) {
    const batch = toFetch.slice(i, i + batchSize);

    const results = await Promise.allSettled(
      batch.map(async (ticker): Promise<PriceResult> => {
        try {
          const quote = await yahooFinance.quote(ticker) as {
            regularMarketPrice?: number;
            postMarketPrice?: number;
          };
          const price =
            quote.regularMarketPrice ?? quote.postMarketPrice ?? null;
          return { ticker, price };
        } catch {
          return { ticker, price: null, error: "Failed to fetch" };
        }
      })
    );

    for (const result of results) {
      if (result.status === "fulfilled" && result.value.price !== null) {
        prices.set(result.value.ticker, result.value.price);
      }
    }

    // Small delay between batches to be respectful
    if (i + batchSize < toFetch.length) {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }

  // Money market funds are always ~$1
  for (const mm of SKIP_TICKERS) {
    if (tickers.includes(mm)) {
      prices.set(mm, 1.0);
    }
  }

  return prices;
}

/**
 * Update all holding prices in the database for a given user.
 * Returns count of updated holdings.
 */
export async function updateAllPrices(clerkId: string): Promise<{
  updated: number;
  failed: number;
  tickers: string[];
}> {
  const db = getDb();

  // Get all unique tickers for this user
  const userHoldings = await db
    .select({
      id: holdings.id,
      ticker: holdings.ticker,
      shares: holdings.shares,
      accountId: holdings.accountId,
    })
    .from(holdings)
    .innerJoin(accounts, eq(holdings.accountId, accounts.id))
    .where(eq(accounts.clerkId, clerkId));

  const uniqueTickers = [...new Set(userHoldings.map((h) => h.ticker))];

  if (uniqueTickers.length === 0) {
    return { updated: 0, failed: 0, tickers: [] };
  }

  const prices = await fetchPrices(uniqueTickers);

  let updated = 0;
  let failed = 0;

  for (const holding of userHoldings) {
    const price = prices.get(holding.ticker);
    if (price !== undefined) {
      const currentValue = Number(holding.shares) * price;
      await db
        .update(holdings)
        .set({
          currentPrice: String(price),
          currentValue: String(currentValue),
          lastPriceUpdate: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(holdings.id, holding.id));
      updated++;
    } else {
      failed++;
    }
  }

  return { updated, failed, tickers: uniqueTickers };
}
