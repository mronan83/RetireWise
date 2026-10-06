import { Redis } from "@upstash/redis";
import { Ratelimit } from "@upstash/ratelimit";

let _redis: Redis | null = null;

export function getRedis(): Redis | null {
  // Support both Vercel KV naming and standard Upstash naming
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  if (!_redis) {
    _redis = new Redis({ url, token });
  }
  return _redis;
}

// Rate limiter for AI chat: 30 requests per minute per user
let _rateLimiter: Ratelimit | null = null;

export function getChatRateLimiter(): Ratelimit | null {
  const redis = getRedis();
  if (!redis) return null;
  if (!_rateLimiter) {
    _rateLimiter = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(30, "60s"),
      prefix: "retirewise:chat",
    });
  }
  return _rateLimiter;
}

// Cache helpers for price data
const PRICE_CACHE_TTL = 900; // 15 minutes

export async function getCachedPrice(
  ticker: string
): Promise<number | null> {
  const redis = getRedis();
  if (!redis) return null;
  const cached = await redis.get<number>(`price:${ticker}`);
  return cached;
}

export async function setCachedPrice(
  ticker: string,
  price: number
): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  await redis.set(`price:${ticker}`, price, { ex: PRICE_CACHE_TTL });
}

/**
 * A quote as cached: the price, the moment it was struck (ISO), and the
 * previous session's close. Kept under its own prefix so an entry written
 * when only the price was cached is never read as one.
 */
export type CachedQuote = { price: number; at: string; previousClose: number | null };

export async function getCachedQuotes(
  tickers: string[]
): Promise<Map<string, CachedQuote>> {
  const redis = getRedis();
  const result = new Map<string, CachedQuote>();
  if (!redis || tickers.length === 0) return result;

  const keys = tickers.map((t) => `quote:${t}`);
  const values = await redis.mget<(CachedQuote | null)[]>(...keys);

  for (let i = 0; i < tickers.length; i++) {
    const v = values[i];
    if (v && typeof v === "object" && typeof v.price === "number" && typeof v.at === "string") {
      result.set(tickers[i], v);
    }
  }
  return result;
}

export async function setCachedQuotes(
  quotes: Map<string, CachedQuote>
): Promise<void> {
  const redis = getRedis();
  if (!redis || quotes.size === 0) return;

  const pipeline = redis.pipeline();
  for (const [ticker, quote] of quotes) {
    pipeline.set(`quote:${ticker}`, quote, { ex: PRICE_CACHE_TTL });
  }
  await pipeline.exec();
}
