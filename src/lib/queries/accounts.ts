import { eq, sql } from "drizzle-orm";
import { getDb } from "../db";
import { accounts, holdings, plaidItems } from "../db/schema";

export async function getAccounts(clerkId: string) {
  const db = getDb();
  return db
    .select()
    .from(accounts)
    .where(eq(accounts.clerkId, clerkId))
    .orderBy(accounts.name);
}

export async function getAccountById(id: string, clerkId: string) {
  const db = getDb();
  const result = await db
    .select()
    .from(accounts)
    .where(eq(accounts.id, id))
    .limit(1);
  const account = result[0];
  if (!account || account.clerkId !== clerkId) return null;
  return account;
}

/**
 * Accounts with the two ages that matter, resolved in one pass.
 *
 * `connection` answers "when did we last reach the institution", which lives
 * on the Plaid item. `valueAsOf` answers "how old is the number on screen",
 * which for an investment account is the OLDEST price among its holdings —
 * not the newest.
 *
 * That choice is the whole point. An account holding nine positions priced
 * this morning and one priced last month is not a fresh account: the total it
 * reports is wrong by whatever that tenth position has done since. Reporting
 * the newest timestamp would hide precisely the case worth seeing.
 */
export async function getAccountsWithFreshness(clerkId: string) {
  const db = getDb();

  const [rows, items, priceAges] = await Promise.all([
    db.select().from(accounts).where(eq(accounts.clerkId, clerkId)).orderBy(accounts.name),
    db.select().from(plaidItems).where(eq(plaidItems.clerkId, clerkId)),
    db
      .select({
        accountId: holdings.accountId,
        oldestPrice: sql<Date | null>`min(${holdings.lastPriceUpdate})`,
        newestPrice: sql<Date | null>`max(${holdings.lastPriceUpdate})`,
        priced: sql<number>`count(${holdings.lastPriceUpdate})::int`,
        total: sql<number>`count(*)::int`,
      })
      .from(holdings)
      .innerJoin(accounts, eq(holdings.accountId, accounts.id))
      .where(eq(accounts.clerkId, clerkId))
      .groupBy(holdings.accountId),
  ]);

  const itemById = new Map(items.map((i) => [i.itemId, i]));
  const agesByAccount = new Map(priceAges.map((p) => [p.accountId, p]));

  return rows.map((account) => {
    const item = account.plaidItemId ? itemById.get(account.plaidItemId) : undefined;
    const ages = agesByAccount.get(account.id);

    return {
      ...account,
      connection: {
        linked: Boolean(item),
        lastSync: item?.lastSync ?? null,
        status: item?.status ?? null,
        consecutiveFailures: item?.consecutiveFailures ?? 0,
        institution: item?.institutionName ?? account.institution,
      },
      /**
       * How old the figure on screen is. For a linked account with no
       * holdings — a bank — the balance arrives with the sync, so the sync
       * time is the value time. For anything else it is the oldest price,
       * falling back to when someone last edited the account by hand.
       */
      valueAsOf:
        ages?.oldestPrice ??
        (item ? (item.lastSync ?? null) : null) ??
        account.updatedAt ??
        null,
      /** Positions carrying no price at all, which no age can describe. */
      unpricedHoldings: ages ? ages.total - ages.priced : 0,
    };
  });
}
