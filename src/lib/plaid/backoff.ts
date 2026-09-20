/**
 * How long to wait before retrying a Plaid item that failed.
 *
 * The previous behaviour was no retry at all: any failure set the item's
 * status to "error", and the refresh job selected only "active" items, so a
 * single timeout removed an account from the rotation permanently. Nothing
 * surfaced it — the dashboard kept showing the last figure it had, which is
 * indistinguishable from a figure that has not changed.
 */

/** Failures after which an item stops being retried and needs a person. */
export const DEAD_LETTER_AFTER = 8;

const BASE_MINUTES = 15;
const CAP_HOURS = 12;

/** Exponential, capped, so a persistent outage costs a few calls a day. */
export function backoffMs(consecutiveFailures: number): number {
  const minutes = BASE_MINUTES * 2 ** Math.max(0, consecutiveFailures - 1);
  return Math.min(minutes, CAP_HOURS * 60) * 60 * 1000;
}

export function nextAttemptAfter(consecutiveFailures: number, from = Date.now()): Date {
  return new Date(from + backoffMs(consecutiveFailures));
}

/**
 * Plaid errors that a retry cannot fix.
 *
 * These mean the user has to reconnect the institution, so retrying is
 * pointless traffic. Anything else is treated as transient until it has
 * failed enough times to prove otherwise.
 */
const TERMINAL_CODES = new Set([
  "ITEM_LOGIN_REQUIRED",
  "ITEM_LOCKED",
  "USER_PERMISSION_REVOKED",
  "USER_ACCOUNT_REVOKED",
  "PENDING_EXPIRATION",
  "ACCESS_NOT_GRANTED",
  "ITEM_NOT_FOUND",
  "INVALID_ACCESS_TOKEN",
]);

export function plaidErrorCode(error: unknown): string | null {
  const body = (error as { response?: { data?: { error_code?: unknown } } })?.response?.data;
  return typeof body?.error_code === "string" ? body.error_code : null;
}

export function needsReconnect(error: unknown): boolean {
  const code = plaidErrorCode(error);
  return code !== null && TERMINAL_CODES.has(code);
}
