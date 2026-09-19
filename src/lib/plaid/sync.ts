import { and, eq, isNull } from "drizzle-orm";
import type { PlaidApi } from "plaid";
import { getDb } from "@/lib/db";
import { accounts, holdings } from "@/lib/db/schema";

type Db = ReturnType<typeof getDb>;

export type SyncCounts = {
  accountsRelinked: number;
  accountsAdopted: number;
  accountsCreated: number;
  holdingsUpdated: number;
  holdingsAdded: number;
  holdingsRemoved: number;
};

const EMPTY: SyncCounts = {
  accountsRelinked: 0,
  accountsAdopted: 0,
  accountsCreated: 0,
  holdingsUpdated: 0,
  holdingsAdded: 0,
  holdingsRemoved: 0,
};

/**
 * Compare institution and account names the way a person would: ignoring case,
 * punctuation and spacing, so "MATT'S ROTH IRA" and "Matts Roth IRA" are one
 * account rather than two.
 */
export function normalizeName(value: string | null | undefined): string {
  return (value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Pull one Plaid item's investment accounts and holdings into the household.
 *
 * Linking is idempotent by construction. Every account is resolved to an
 * existing row before anything is inserted, and holdings are reconciled
 * against what is already stored rather than appended, so re-linking the same
 * institution updates the household instead of doubling it. This is shared by
 * the link handler and the nightly cron precisely because the two drifting
 * apart is what produced duplicates in the first place.
 */
export async function syncPlaidItem(options: {
  client: PlaidApi;
  clerkId: string;
  itemId: string;
  accessToken: string;
  institutionName: string;
}): Promise<SyncCounts> {
  const { client, clerkId, itemId, accessToken, institutionName } = options;
  const db = getDb();

  const response = await client.investmentsHoldingsGet({
    access_token: accessToken,
  });

  const securities = new Map(
    response.data.securities.map((s) => [s.security_id, s])
  );
  const counts: SyncCounts = { ...EMPTY };

  // Manual accounts this household owns, as adoption candidates. Read once:
  // an account adopted in this loop must not be offered to the next one.
  const unlinked = await db
    .select()
    .from(accounts)
    .where(and(eq(accounts.clerkId, clerkId), isNull(accounts.plaidAccountId)));
  const available = new Map(unlinked.map((a) => [a.id, a]));

  for (const pa of response.data.accounts) {
    const accountType = mapPlaidAccountType(pa.subtype || pa.type);
    const plaidName = pa.name || pa.official_name || "Plaid Account";

    const accountId = await resolveAccount({
      db,
      clerkId,
      itemId,
      institutionName,
      plaidAccountId: pa.account_id,
      plaidName,
      accountType,
      available,
      counts,
    });

    const incoming = aggregateHoldings(
      response.data.holdings.filter((h) => h.account_id === pa.account_id),
      securities
    );

    const reconciled = await reconcileHoldings(db, accountId, incoming);
    counts.holdingsUpdated += reconciled.updated;
    counts.holdingsAdded += reconciled.added;
    counts.holdingsRemoved += reconciled.removed;
  }

  return counts;
}

/**
 * Find the row this Plaid account already corresponds to, or create one.
 *
 * Three cases, strongest evidence first: the same Plaid account id (a re-link),
 * the same institution and name as an account entered by hand (the user
 * already tracked it manually), or nothing recognisable (genuinely new).
 * A weaker guess than an exact name match is deliberately not made here —
 * silently folding "Tricia's Roth" into Matt's would misstate the portfolio
 * just as badly as a duplicate. Those are surfaced for confirmation instead.
 */
async function resolveAccount(args: {
  db: Db;
  clerkId: string;
  itemId: string;
  institutionName: string;
  plaidAccountId: string;
  plaidName: string;
  accountType: ReturnType<typeof mapPlaidAccountType>;
  available: Map<string, typeof accounts.$inferSelect>;
  counts: SyncCounts;
}): Promise<string> {
  const {
    db,
    clerkId,
    itemId,
    institutionName,
    plaidAccountId,
    plaidName,
    accountType,
    available,
    counts,
  } = args;

  const [existing] = await db
    .select({ id: accounts.id })
    .from(accounts)
    .where(
      and(
        eq(accounts.clerkId, clerkId),
        eq(accounts.plaidAccountId, plaidAccountId)
      )
    )
    .limit(1);

  if (existing) {
    await db
      .update(accounts)
      .set({
        institution: institutionName,
        plaidItemId: itemId,
        dataSource: "plaid",
        updatedAt: new Date(),
      })
      .where(eq(accounts.id, existing.id));
    counts.accountsRelinked++;
    return existing.id;
  }

  const wantedName = normalizeName(plaidName);
  const wantedInstitution = normalizeName(institutionName);
  const adoptable = [...available.values()].find(
    (a) =>
      normalizeName(a.name) === wantedName &&
      normalizeName(a.institution) === wantedInstitution
  );

  if (adoptable) {
    available.delete(adoptable.id);
    await db
      .update(accounts)
      .set({
        plaidItemId: itemId,
        plaidAccountId,
        dataSource: "plaid",
        updatedAt: new Date(),
      })
      .where(eq(accounts.id, adoptable.id));
    counts.accountsAdopted++;
    return adoptable.id;
  }

  const [created] = await db
    .insert(accounts)
    .values({
      clerkId,
      name: plaidName,
      institution: institutionName,
      accountType,
      taxTreatment: inferTaxTreatment(accountType),
      plaidItemId: itemId,
      plaidAccountId,
      dataSource: "plaid",
    })
    .returning({ id: accounts.id });

  counts.accountsCreated++;
  return created.id;
}

type IncomingHolding = {
  ticker: string;
  name: string;
  assetClass: ReturnType<typeof mapPlaidSecurityType>;
  shares: number;
  costBasisPerShare: number;
  currentPrice: number;
};

/**
 * Collapse Plaid's per-lot rows into one position per ticker.
 *
 * A position held in several lots comes back as several holdings. Inserting
 * each one would show the same fund two or three times, so shares are summed
 * and cost basis is averaged across them.
 */
function aggregateHoldings(
  plaidHoldings: { security_id: string; quantity: number; institution_price?: number | null; cost_basis?: number | null }[],
  securities: Map<string, { ticker_symbol?: string | null; cusip?: string | null; name?: string | null; type?: string | null }>
): IncomingHolding[] {
  const byTicker = new Map<string, IncomingHolding & { totalCost: number }>();

  for (const ph of plaidHoldings) {
    const security = securities.get(ph.security_id);
    if (!security) continue;

    const ticker =
      security.ticker_symbol || security.cusip || security.name || "UNKNOWN";
    const shares = ph.quantity ?? 0;
    const currentPrice = ph.institution_price ?? 0;
    const totalCost = ph.cost_basis ?? shares * currentPrice;

    const existing = byTicker.get(ticker);
    if (existing) {
      existing.shares += shares;
      existing.totalCost += totalCost;
      existing.currentPrice = currentPrice || existing.currentPrice;
    } else {
      byTicker.set(ticker, {
        ticker,
        name: security.name || ticker,
        assetClass: mapPlaidSecurityType(security.type ?? null),
        shares,
        costBasisPerShare: 0,
        currentPrice,
        totalCost,
      });
    }
  }

  return [...byTicker.values()].map((h) => ({
    ticker: h.ticker,
    name: h.name,
    assetClass: h.assetClass,
    shares: h.shares,
    costBasisPerShare: h.shares > 0 ? h.totalCost / h.shares : h.currentPrice,
    currentPrice: h.currentPrice,
  }));
}

/**
 * Make the account's holdings match what Plaid reports: update what is held,
 * add what is new, drop what was sold. Plaid is authoritative for an account
 * it feeds, so a ticker it no longer reports is a closed position, not a row
 * to keep alongside the live ones.
 */
async function reconcileHoldings(
  db: Db,
  accountId: string,
  incoming: IncomingHolding[]
) {
  const existing = await db
    .select()
    .from(holdings)
    .where(eq(holdings.accountId, accountId));

  const existingByTicker = new Map(existing.map((h) => [h.ticker, h]));
  const incomingTickers = new Set(incoming.map((h) => h.ticker));

  let updated = 0;
  let added = 0;
  let removed = 0;

  for (const h of incoming) {
    const match = existingByTicker.get(h.ticker);
    const values = {
      name: h.name,
      assetClass: h.assetClass,
      shares: String(h.shares),
      costBasisPerShare: String(h.costBasisPerShare),
      currentPrice: String(h.currentPrice),
      currentValue: String(h.shares * h.currentPrice),
      dataSource: "plaid" as const,
      lastPriceUpdate: new Date(),
    };

    if (match) {
      await db
        .update(holdings)
        .set({ ...values, updatedAt: new Date() })
        .where(eq(holdings.id, match.id));
      updated++;
    } else {
      await db.insert(holdings).values({ accountId, ticker: h.ticker, ...values });
      added++;
    }
  }

  // Only prune when Plaid actually returned positions. An empty response is
  // far more often a permissions or timing problem than a liquidated account,
  // and emptying the account on that signal loses data the user typed in.
  if (incoming.length > 0) {
    for (const [ticker, holding] of existingByTicker) {
      if (!incomingTickers.has(ticker)) {
        await db.delete(holdings).where(eq(holdings.id, holding.id));
        removed++;
      }
    }
  }

  return { updated, added, removed };
}

export function mapPlaidAccountType(
  subtype: string | null
): "401k" | "ira_traditional" | "ira_roth" | "brokerage" | "hsa" | "other" {
  switch (subtype) {
    case "401k":
    case "401a":
    case "403B":
    case "403b":
      return "401k";
    case "ira":
    case "sep ira":
    case "simple ira":
    case "rollover":
      return "ira_traditional";
    case "roth":
    case "roth ira":
    case "roth 401k":
      return "ira_roth";
    case "hsa":
      return "hsa";
    case "brokerage":
    case "individual":
    case "joint":
      return "brokerage";
    default:
      return "brokerage";
  }
}

export function inferTaxTreatment(
  accountType: string
): "tax_deferred" | "tax_free" | "taxable" {
  switch (accountType) {
    case "401k":
    case "403b":
    case "ira_traditional":
    case "pension":
      return "tax_deferred";
    case "ira_roth":
    case "hsa":
      return "tax_free";
    default:
      return "taxable";
  }
}

export function mapPlaidSecurityType(
  type: string | null
): "us_stock" | "bond" | "cash" | "other" {
  switch (type) {
    case "equity":
    case "etf":
    case "mutual fund":
      return "us_stock";
    case "fixed income":
      return "bond";
    case "cash":
      return "cash";
    default:
      return "other";
  }
}
