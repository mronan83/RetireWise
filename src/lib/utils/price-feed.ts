import { getCachedPrices, setCachedPrices } from "../redis";

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
export const _lastFetchErrors: { ticker: string; error: string }[] = [];

export async function fetchPrices(tickers: string[]): Promise<Map<string, number>> {
  _lastFetchErrors.length = 0;
  const prices = new Map<string, number>();
  const toFetch = tickers.filter((t) => !SKIP_TICKERS.has(t));

  // Check Redis cache first
  const cached = await getCachedPrices(toFetch);
  for (const [ticker, price] of cached) {
    prices.set(ticker, price);
  }
  const uncached = toFetch.filter((t) => !cached.has(t));

  // Fetch uncached tickers in batches of 20
  const batchSize = 20;
  const freshPrices = new Map<string, number>();
  for (let i = 0; i < uncached.length; i += batchSize) {
    const batch = uncached.slice(i, i + batchSize);

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
        } catch (e) {
          const errMsg = e instanceof Error ? e.message : String(e);
          _lastFetchErrors.push({ ticker, error: errMsg });
          return { ticker, price: null, error: errMsg };
        }
      })
    );

    for (const result of results) {
      if (result.status === "fulfilled" && result.value.price !== null) {
        prices.set(result.value.ticker, result.value.price);
        freshPrices.set(result.value.ticker, result.value.price);
      }
    }

    if (i + batchSize < uncached.length) {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }

  // Cache fresh prices in Redis
  if (freshPrices.size > 0) {
    await setCachedPrices(freshPrices);
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
