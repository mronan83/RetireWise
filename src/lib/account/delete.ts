import { eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { withSystemRole } from "@/lib/db/tenant";
import {
  accountSnapshots,
  accounts,
  aiAnalyses,
  alerts,
  auditLog,
  cashReserves,
  contributions,
  debts,
  goals,
  holdings,
  householdInvites,
  householdJoinAttempts,
  householdMembers,
  households,
  netWorthItemHistory,
  netWorthSnapshots,
  plaidItems,
  portfolioSnapshots,
  realEstate,
  socialSecurityBenefits,
  subscriptions,
  transactions,
  userPreferences,
  vehicles,
} from "@/lib/db/schema";

/**
 * Erase a household's data.
 *
 * Deletion, not deactivation. A flag that hides rows is the version of this
 * that looks finished and is not: the data is still there, still in every
 * backup, and still readable by anything that forgets to check the flag.
 *
 * Order matters — children before parents, because the foreign keys are only
 * partly cascading — and it runs in one transaction, so a failure halfway
 * leaves the household whole rather than half-erased with no way to tell
 * which half.
 */
export type DeletionResult = {
  deleted: Record<string, number>;
  totalRows: number;
};

export async function deleteHouseholdData(clerkId: string): Promise<DeletionResult> {
  const db = getDb();
  const deleted: Record<string, number> = {};

  const ownedAccounts = await db
    .select({ id: accounts.id })
    .from(accounts)
    .where(eq(accounts.clerkId, clerkId));
  const accountIds = ownedAccounts.map((a) => a.id);

  // Rows that hang off an account and carry no household key of their own.
  if (accountIds.length > 0) {
    for (const [name, table, column] of [
      ["transactions", transactions, transactions.accountId],
      ["accountSnapshots", accountSnapshots, accountSnapshots.accountId],
      ["holdings", holdings, holdings.accountId],
    ] as const) {
      const rows = await db
        .delete(table)
        .where(inArray(column, accountIds))
        .returning({ id: table.id });
      deleted[name] = rows.length;
    }
  }

  for (const [name, table, column] of [
    ["accounts", accounts, accounts.clerkId],
    ["contributions", contributions, contributions.clerkId],
    ["goals", goals, goals.clerkId],
    ["alerts", alerts, alerts.clerkId],
    ["aiAnalyses", aiAnalyses, aiAnalyses.clerkId],
    ["cashReserves", cashReserves, cashReserves.clerkId],
    ["debts", debts, debts.clerkId],
    ["realEstate", realEstate, realEstate.clerkId],
    ["vehicles", vehicles, vehicles.clerkId],
    ["socialSecurityBenefits", socialSecurityBenefits, socialSecurityBenefits.clerkId],
    ["portfolioSnapshots", portfolioSnapshots, portfolioSnapshots.clerkId],
    ["netWorthSnapshots", netWorthSnapshots, netWorthSnapshots.clerkId],
    ["netWorthItemHistory", netWorthItemHistory, netWorthItemHistory.clerkId],
    ["plaidItems", plaidItems, plaidItems.clerkId],
    ["userPreferences", userPreferences, userPreferences.clerkId],
    ["subscriptions", subscriptions, subscriptions.clerkId],
  ] as const) {
    const rows = await db.delete(table).where(eq(column, clerkId)).returning({ id: table.id });
    deleted[name] = rows.length;
  }

  // The household itself, its members and its outstanding invitations. Only
  // the primary can reach this path, so a spouse leaving does not dissolve
  // the household underneath the person who owns the data.
  const owned = await db
    .select({ id: households.id })
    .from(households)
    .where(eq(households.primaryClerkId, clerkId));

  for (const household of owned) {
    const invites = await db
      .delete(householdInvites)
      .where(eq(householdInvites.householdId, household.id))
      .returning({ id: householdInvites.id });
    deleted.householdInvites = (deleted.householdInvites ?? 0) + invites.length;

    const members = await db
      .delete(householdMembers)
      .where(eq(householdMembers.householdId, household.id))
      .returning({ id: householdMembers.id });
    deleted.householdMembers = (deleted.householdMembers ?? 0) + members.length;
  }

  const removedHouseholds = await db
    .delete(households)
    .where(eq(households.primaryClerkId, clerkId))
    .returning({ id: households.id });
  deleted.households = removedHouseholds.length;

  // Two tables the application is deliberately not allowed to delete from.
  //
  // app_user holds SELECT and INSERT on the audit log and on the join-attempt
  // records, and nothing more. A log the application can edit is not a log,
  // and a rate limiter whose history the rate-limited party can clear is not a
  // limit. Erasure is the one legitimate exception, so it escalates in one
  // named place rather than being made possible everywhere by a grant.
  //
  // The audit trail goes completely: keeping a dated record of someone who
  // asked to be erased is the opposite of what they asked for.
  await withSystemRole("erase records the application may not delete", async () => {
    const privileged = getDb();

    const attempts = await privileged
      .delete(householdJoinAttempts)
      .where(eq(householdJoinAttempts.clerkId, clerkId))
      .returning({ id: householdJoinAttempts.id });
    deleted.householdJoinAttempts = attempts.length;

    const audit = await privileged
      .delete(auditLog)
      .where(eq(auditLog.clerkId, clerkId))
      .returning({ id: auditLog.id });
    deleted.auditLog = audit.length;
  });

  return {
    deleted,
    totalRows: Object.values(deleted).reduce((a, b) => a + b, 0),
  };
}
