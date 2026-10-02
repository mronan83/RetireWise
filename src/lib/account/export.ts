import { eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  accountSnapshots,
  accounts,
  aiAnalyses,
  alerts,
  auditLog,
  cashReserves,
  contributions,
  debts,
  goalLinks,
  goals,
  holdingSnapshots,
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
 * Everything RetireWise holds about one household, as data it can keep.
 *
 * Two rules decide what goes in.
 *
 * Completeness: if a row is keyed to this household, it belongs here. A
 * "download your data" that quietly omits the tables nobody thought of is
 * worse than none, because it tells the reader they have seen everything.
 *
 * Secrets stay out. The encrypted columns — Plaid access tokens and the
 * household's own AI provider keys — are reported as present or absent and
 * never decrypted. An export lands in a downloads folder, gets mailed
 * around, and ends up in a backup; a bank access token has no business
 * making that journey, and the person already holds their own API key.
 */
export type AccountExport = {
  meta: {
    exportedAt: string;
    householdId: string | null;
    format: string;
    note: string;
  };
  household: unknown;
  data: Record<string, unknown[]>;
  credentials: {
    linkedInstitutions: { institution: string; status: string; linkedAt: string }[];
    aiProviderKeysStored: string[];
    note: string;
  };
};

export const EXPORT_FORMAT_VERSION = "retirewise.household-export.v1";

export async function buildAccountExport(clerkId: string): Promise<AccountExport> {
  const db = getDb();

  // Holdings and transactions hang off accounts rather than carrying the
  // household key themselves, so they are fetched by account id.
  const ownedAccounts = await db.select().from(accounts).where(eq(accounts.clerkId, clerkId));
  const accountIds = ownedAccounts.map((a) => a.id);

  const byAccount = async <T>(
    run: (ids: string[]) => Promise<T[]>
  ): Promise<T[]> => (accountIds.length === 0 ? [] : run(accountIds));

  const [
    prefs,
    contributionRows,
    goalRows,
    alertRows,
    analyses,
    cash,
    debtRows,
    property,
    vehicleRows,
    socialSecurity,
    holdingRows,
    transactionRows,
    accountSnapshotRows,
    portfolioSnapshotRows,
    netWorthSnapshotRows,
    netWorthHistoryRows,
    items,
    subscription,
    audit,
    membership,
    invites,
    goalLinkRows,
    holdingSnapshotRows,
    joinAttempts,
  ] = await Promise.all([
    db.select().from(userPreferences).where(eq(userPreferences.clerkId, clerkId)),
    db.select().from(contributions).where(eq(contributions.clerkId, clerkId)),
    db.select().from(goals).where(eq(goals.clerkId, clerkId)),
    db.select().from(alerts).where(eq(alerts.clerkId, clerkId)),
    db.select().from(aiAnalyses).where(eq(aiAnalyses.clerkId, clerkId)),
    db.select().from(cashReserves).where(eq(cashReserves.clerkId, clerkId)),
    db.select().from(debts).where(eq(debts.clerkId, clerkId)),
    db.select().from(realEstate).where(eq(realEstate.clerkId, clerkId)),
    db.select().from(vehicles).where(eq(vehicles.clerkId, clerkId)),
    db.select().from(socialSecurityBenefits).where(eq(socialSecurityBenefits.clerkId, clerkId)),
    byAccount((ids) => db.select().from(holdings).where(inArray(holdings.accountId, ids))),
    byAccount((ids) => db.select().from(transactions).where(inArray(transactions.accountId, ids))),
    byAccount((ids) =>
      db.select().from(accountSnapshots).where(inArray(accountSnapshots.accountId, ids))
    ),
    db.select().from(portfolioSnapshots).where(eq(portfolioSnapshots.clerkId, clerkId)),
    db.select().from(netWorthSnapshots).where(eq(netWorthSnapshots.clerkId, clerkId)),
    db.select().from(netWorthItemHistory).where(eq(netWorthItemHistory.clerkId, clerkId)),
    db.select().from(plaidItems).where(eq(plaidItems.clerkId, clerkId)),
    db.select().from(subscriptions).where(eq(subscriptions.clerkId, clerkId)),
    db.select().from(auditLog).where(eq(auditLog.clerkId, clerkId)).orderBy(auditLog.at),
    db.select().from(households).where(eq(households.primaryClerkId, clerkId)),
    db.select().from(householdInvites),
    db.select().from(goalLinks).where(eq(goalLinks.clerkId, clerkId)),
    db.select().from(holdingSnapshots).where(eq(holdingSnapshots.clerkId, clerkId)),
    // Row level security shows a person only their own attempts to join a
    // household, which is exactly the set that belongs in their export.
    db.select().from(householdJoinAttempts),
  ]);

  const householdRow = membership[0] ?? null;
  const members = householdRow
    ? await db
        .select()
        .from(householdMembers)
        .where(eq(householdMembers.householdId, householdRow.id))
    : [];

  // Strip the encrypted columns rather than exporting ciphertext nobody can
  // open — it would be noise in the file and a liability in a backup.
  const storedKeys = prefs[0]
    ? (["anthropic", "google", "openai"] as const).filter((p) => {
        const column = `${p}ApiKey` as const;
        return Boolean(prefs[0][column]);
      })
    : [];

  const safePrefs = prefs.map((row) => {
    const copy: Record<string, unknown> = { ...row };
    delete copy.anthropicApiKey;
    delete copy.googleApiKey;
    delete copy.openaiApiKey;
    return copy;
  });

  const safeItems = items.map((item) => {
    const copy: Record<string, unknown> = { ...item };
    delete copy.accessTokenEncrypted;
    return copy;
  });

  return {
    meta: {
      exportedAt: new Date().toISOString(),
      householdId: householdRow?.id ?? null,
      format: EXPORT_FORMAT_VERSION,
      note:
        "Everything RetireWise holds for this household. Access tokens and AI " +
        "provider keys are deliberately excluded — see the credentials section.",
    },
    household: householdRow
      ? { ...householdRow, members }
      : { note: "This account is not part of a shared household." },
    data: {
      preferences: safePrefs,
      accounts: ownedAccounts,
      holdings: holdingRows,
      transactions: transactionRows,
      contributions: contributionRows,
      goals: goalRows,
      goalLinks: goalLinkRows,
      alerts: alertRows,
      aiAnalyses: analyses,
      cashReserves: cash,
      debts: debtRows,
      realEstate: property,
      vehicles: vehicleRows,
      socialSecurityBenefits: socialSecurity,
      accountSnapshots: accountSnapshotRows,
      portfolioSnapshots: portfolioSnapshotRows,
      holdingSnapshots: holdingSnapshotRows,
      netWorthSnapshots: netWorthSnapshotRows,
      netWorthItemHistory: netWorthHistoryRows,
      plaidItems: safeItems,
      subscription,
      auditLog: audit,
      householdJoinAttempts: joinAttempts,
      // Only this household's invitations are visible under row level
      // security, and only their last four characters were ever stored.
      householdInvites: invites.map((i) => {
        const copy: Record<string, unknown> = { ...i };
        delete copy.codeHash;
        return copy;
      }),
    },
    credentials: {
      linkedInstitutions: items.map((i) => ({
        institution: i.institutionName,
        status: i.status,
        linkedAt: i.createdAt.toISOString(),
      })),
      aiProviderKeysStored: storedKeys,
      note:
        "Plaid access tokens and AI provider API keys are stored encrypted and " +
        "are never included in an export. To move your AI key, copy it from " +
        "the provider you obtained it from.",
    },
  };
}

/** Row counts per table, for a deletion confirmation screen. */
export async function summariseAccountData(
  clerkId: string
): Promise<{ table: string; rows: number }[]> {
  const exported = await buildAccountExport(clerkId);
  return Object.entries(exported.data)
    .map(([table, rows]) => ({ table, rows: Array.isArray(rows) ? rows.length : 0 }))
    .filter((r) => r.rows > 0)
    .sort((a, b) => b.rows - a.rows);
}

/** Guard against a count query drifting from the export. */
export async function totalRowsFor(clerkId: string): Promise<number> {
  const summary = await summariseAccountData(clerkId);
  return summary.reduce((total, r) => total + r.rows, 0);
}

