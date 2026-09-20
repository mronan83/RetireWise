import { AsyncLocalStorage } from "async_hooks";
import { sql } from "drizzle-orm";
import { getBaseDb, type Db } from "./index";

/**
 * Per-request database identity.
 *
 * The application connects as the table owner, which both owns every table and
 * carries BYPASSRLS — so row level security, though enabled on all 25 tables,
 * has never applied to a single query. The only thing separating one
 * household's data from another's is a `where clerk_id = ...` that a developer
 * has to remember to write. Twenty-four files once got that wrong, and the
 * symptom was an empty dashboard rather than an error.
 *
 * `withTenant` changes what a mistake costs. Inside it, statements run as
 * `app_user` — a role with no ownership and no BYPASSRLS — with the household
 * id in a transaction-local setting that every policy reads. A query that
 * forgets its filter comes back empty instead of coming back with somebody
 * else's money.
 *
 * Transaction-local, not session-level, and that is not a detail: Supavisor
 * pools in transaction mode and can hand the same backend to another client
 * between transactions. A session-level `SET ROLE` would leak one household's
 * identity into the next request that happened to land on that connection.
 */

type TenantContext = { db: Db; clerkId: string; system: boolean };

const store = new AsyncLocalStorage<TenantContext>();

/**
 * The database handle for the current context.
 *
 * Unchanged at every call site: inside `withTenant` this is the scoped
 * transaction, and outside it the plain connection. AsyncLocalStorage carries
 * the context through awaits and Promise.all, so a page that fires eight
 * queries concurrently gets the same one for all of them.
 */
export function getDb(): Db {
  return store.getStore()?.db ?? getBaseDb();
}

/** The household id the current context is scoped to, if any. */
export function currentTenant(): string | null {
  return store.getStore()?.clerkId ?? null;
}

/**
 * Run everything inside as one household, under row level security.
 *
 * `clerkId` is the household's primary id — the value every row is keyed by —
 * and `accountId` is the signed-in account's own id, which differs for a
 * spouse who joined. Both are needed: household membership is keyed by the
 * individual, everything else by the household.
 */
export async function withTenant<T>(
  clerkId: string,
  accountId: string,
  fn: () => Promise<T>
): Promise<T> {
  return getBaseDb().transaction(async (tx) => {
    await tx.execute(sql`SELECT set_config('app.clerk_id', ${clerkId}, true)`);
    await tx.execute(sql`SELECT set_config('app.account_id', ${accountId}, true)`);
    // Last, because after this the role can no longer change anything else.
    await tx.execute(sql`SET LOCAL ROLE app_user`);
    return store.run({ db: tx, clerkId, system: false }, fn);
  });
}

/**
 * Run with the owner's privileges, outside row level security.
 *
 * Reserved for work that genuinely has no single tenant, and each use should
 * be able to say which:
 *
 *  - resolving an account to its household, which is what decides the tenant
 *    and therefore cannot already know it;
 *  - redeeming an invitation, which by definition reads a household the caller
 *    is not yet a member of;
 *  - the cron jobs, which iterate every household;
 *  - the Stripe and Plaid webhooks, which are authenticated by signature
 *    rather than by session and act on whichever household the payload names;
 *  - migrations and the demo seeder.
 *
 * Anything else belongs in `withTenant`.
 */
export async function withSystemRole<T>(reason: string, fn: () => Promise<T>): Promise<T> {
  void reason; // Present to make each call state its justification at the call site.
  return store.run({ db: getBaseDb(), clerkId: "", system: true }, fn);
}
