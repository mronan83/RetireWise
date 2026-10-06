import { getCachedQuotes, setCachedQuotes, type CachedQuote } from "../redis";
import { resolvePriceUpdate } from "./market-session";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const YahooFinance = require("yahoo-finance2").default;
const yahooFinance = typeof YahooFinance === "function" ? new YahooFinance() : YahooFinance;
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

/**
 * A price as the market struck it: the price, the moment it was struck, and
 * the previous session's close. The moment is the quote's own, not the
 * fetch's: a mutual fund fetched at noon carries yesterday's price, stamped
 * by Yahoo before the open, and must not read as noon's.
 */
export type Quote = { price: number; at: Date; previousClose: number | null };

type YahooQuote = {
  regularMarketPrice?: number | null;
  regularMarketTime?: Date | number | string | null;
  regularMarketPreviousClose?: number | null;
  postMarketPrice?: number | null;
  postMarketTime?: Date | number | string | null;
};

function toDate(t: Date | number | string | null | undefined): Date | null {
  if (t === null || t === undefined) return null;
  // Yahoo sends epoch seconds; the library usually turns them into a Date.
  const d = t instanceof Date ? t : typeof t === "number" ? new Date(t < 1e12 ? t * 1000 : t) : new Date(t);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * A Yahoo quote as a Quote, or null when it has no price. Without a time of
 * its own the quote is dated when it was fetched, which is what every price
 * was dated before, and never later than that.
 */
export function quoteFrom(raw: YahooQuote, fetchedAt: Date = new Date()): Quote | null {
  const regular = typeof raw.regularMarketPrice === "number" && raw.regularMarketPrice > 0;
  const price = regular ? raw.regularMarketPrice! : raw.postMarketPrice ?? null;
  if (typeof price !== "number" || !(price > 0)) return null;
  const struck = toDate(regular ? raw.regularMarketTime : raw.postMarketTime);
  const at = struck && struck.getTime() <= fetchedAt.getTime() ? struck : fetchedAt;
  const previousClose =
    typeof raw.regularMarketPreviousClose === "number" && raw.regularMarketPreviousClose > 0
      ? raw.regularMarketPreviousClose
      : null;
  return { price, at, previousClose };
}

/**
 * Fetch quotes for a list of tickers via Yahoo Finance.
 * Batches requests and handles failures gracefully.
 */
export const _lastFetchErrors: { ticker: string; error: string }[] = [];

export async function fetchQuotes(tickers: string[]): Promise<Map<string, Quote>> {
  _lastFetchErrors.length = 0;
  const quotes = new Map<string, Quote>();
  const toFetch = tickers.filter((t) => !SKIP_TICKERS.has(t));

  // Check Redis cache first
  const cached = await getCachedQuotes(toFetch);
  for (const [ticker, q] of cached) {
    quotes.set(ticker, { price: q.price, at: new Date(q.at), previousClose: q.previousClose });
  }
  const uncached = toFetch.filter((t) => !cached.has(t));

  // Fetch uncached tickers in batches of 20
  const batchSize = 20;
  const fresh = new Map<string, CachedQuote>();
  for (let i = 0; i < uncached.length; i += batchSize) {
    const batch = uncached.slice(i, i + batchSize);

    const results = await Promise.allSettled(
      batch.map(async (ticker): Promise<{ ticker: string; quote: Quote | null }> => {
        try {
          const raw = (await yahooFinance.quote(ticker)) as YahooQuote;
          return { ticker, quote: quoteFrom(raw) };
        } catch (e) {
          const errMsg = e instanceof Error ? e.message : String(e);
          _lastFetchErrors.push({ ticker, error: errMsg });
          return { ticker, quote: null };
        }
      })
    );

    for (const result of results) {
      if (result.status === "fulfilled" && result.value.quote) {
        const { ticker, quote } = result.value;
        quotes.set(ticker, quote);
        fresh.set(ticker, { price: quote.price, at: quote.at.toISOString(), previousClose: quote.previousClose });
      }
    }

    if (i + batchSize < uncached.length) {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }

  // Cache fresh quotes in Redis
  if (fresh.size > 0) {
    await setCachedQuotes(fresh);
  }

  // Money market funds are always ~$1, as of now, and moved nothing today.
  const now = new Date();
  for (const mm of SKIP_TICKERS) {
    if (tickers.includes(mm)) {
      quotes.set(mm, { price: 1.0, at: now, previousClose: 1.0 });
    }
  }

  return quotes;
}

/**
 * Update all holding prices in the database for a given user.
 *
 * Each price is stored with the moment it was struck and the previous
 * session's close, through resolvePriceUpdate: a quote older than the price
 * already stored (one the bank's sync wrote later) is kept out.
 */
export async function updateAllPrices(clerkId: string): Promise<{
  updated: number;
  /** Holdings whose stored price was already later than the quote. */
  kept: number;
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
      currentPrice: holdings.currentPrice,
      previousClose: holdings.previousClose,
      lastPriceUpdate: holdings.lastPriceUpdate,
    })
    .from(holdings)
    .innerJoin(accounts, eq(holdings.accountId, accounts.id))
    .where(eq(accounts.clerkId, clerkId));

  const uniqueTickers = [...new Set(userHoldings.map((h) => h.ticker))];

  if (uniqueTickers.length === 0) {
    return { updated: 0, kept: 0, failed: 0, tickers: [] };
  }

  const quotes = await fetchQuotes(uniqueTickers);

  let updated = 0;
  let kept = 0;
  let failed = 0;

  for (const holding of userHoldings) {
    const quote = quotes.get(holding.ticker);
    if (quote === undefined) {
      failed++;
      continue;
    }
    const next = resolvePriceUpdate(quote, {
      price: Number(holding.currentPrice),
      at: holding.lastPriceUpdate,
      previousClose: holding.previousClose === null ? null : Number(holding.previousClose),
    });
    if (!next) {
      kept++;
      continue;
    }
    await db
      .update(holdings)
      .set({
        currentPrice: String(next.price),
        currentValue: String(Number(holding.shares) * next.price),
        previousClose: next.previousClose === null ? null : String(next.previousClose),
        lastPriceUpdate: next.at,
        updatedAt: new Date(),
      })
      .where(eq(holdings.id, holding.id));
    updated++;
  }

  return { updated, kept, failed, tickers: uniqueTickers };
}
