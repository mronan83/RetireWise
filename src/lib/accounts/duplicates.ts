import { normalizeName } from "@/lib/plaid/sync";
import type { Account } from "@/lib/types";

export type DuplicateCandidate = {
  linked: Account;
  manual: Account;
  /** True when the account type also matches, not just the institution. */
  sameType: boolean;
};

/**
 * Pair every Plaid-linked account with the hand-entered accounts at the same
 * institution that it might be a second copy of.
 *
 * Linking an institution the user already tracked by hand is the one way this
 * app can end up counting the same money twice, and it is invisible in the
 * totals — two rows of $50k simply read as $100k. The pairing is deliberately
 * loose and never acts on its own: the aim is to put the question in front of
 * the user, who is the only one who actually knows.
 */
export function findDuplicateCandidates(
  allAccounts: Account[]
): DuplicateCandidate[] {
  const linked = allAccounts.filter((a) => a.plaidAccountId !== null);
  const manual = allAccounts.filter((a) => a.plaidAccountId === null);
  if (linked.length === 0 || manual.length === 0) return [];

  const candidates: DuplicateCandidate[] = [];

  for (const l of linked) {
    const institution = normalizeName(l.institution);
    for (const m of manual) {
      if (normalizeName(m.institution) !== institution) continue;
      candidates.push({
        linked: l,
        manual: m,
        sameType: l.accountType === m.accountType,
      });
    }
  }

  // A type match is the stronger signal, so lead with those.
  return candidates.sort((a, b) => Number(b.sameType) - Number(a.sameType));
}
