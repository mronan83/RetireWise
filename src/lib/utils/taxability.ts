/**
 * One place that decides whether an account is taxable.
 *
 * It was decided in two places, and they disagreed. The tax-loss harvesting
 * scanner inferred taxability from `account_type`, counting "brokerage" and
 * "other" as taxable and everything else as not. The `tax_treatment` column
 * is what actually records it, and it is set independently — so an account
 * typed "other" and treated as tax-free was scanned, and a taxable account
 * typed as anything outside that pair was skipped.
 *
 * Both failures are silent. A scan of the wrong set of accounts returns a
 * plausible list of harvest candidates; nothing says the set was wrong. So
 * the inference is gone and the column is the answer, everywhere.
 */

export type TaxTreatment = "tax_deferred" | "tax_free" | "taxable";

type Taxed = { taxTreatment: string };
type HeldInAccount = { accountTaxTreatment: string };

/** True only where the account is recorded as taxable. */
export function isTaxable(account: Taxed): boolean {
  return account.taxTreatment === "taxable";
}

/**
 * Whether any account in the household is taxable.
 *
 * Tax-loss harvesting is defined on taxable accounts and on nothing else:
 * realising a loss inside a 401(k), IRA or HSA offsets no gain, because no
 * gain there is taxed. A household without one has no harvest to find, and
 * the UI should say so rather than run an analysis that can only report the
 * absence.
 */
export function hasTaxableAccount(accounts: Taxed[]): boolean {
  return accounts.some(isTaxable);
}

/** The holdings a tax-loss harvesting scan may consider. */
export function taxableHoldings<T extends HeldInAccount>(holdings: T[]): T[] {
  return holdings.filter((h) => h.accountTaxTreatment === "taxable");
}
