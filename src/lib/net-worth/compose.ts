/**
 * Net worth, with every liability counted exactly once.
 *
 * A loan on a car or a house can be recorded in two places: as a field on the
 * asset itself (`vehicles.loan_balance`, `real_estate.mortgage_balance`), and
 * as a row in `debts`. Both are legitimate — the asset fields predate Plaid
 * and are typed by hand, the debt rows sync nightly — but the total subtracted
 * both:
 *
 *   const vehicleEquity = vehicleValue - vehicleLoanTotal;   // once
 *   const totalAssets   = investments + realEstateEquity + cash + vehicleEquity;
 *   const netWorth      = totalAssets - debtTotal;           // and again
 *
 * When a bank connection brought in the same two car loans already typed onto
 * the vehicles, $81,442.58 was subtracted twice and the reported net worth
 * fell by that much overnight with nothing to explain it.
 *
 * The rule here is simple and total: a liability belongs to an asset when a
 * debt row says it does. Where a debt is secured by an asset, that balance is
 * the asset's — and the asset's own typed-in figure is ignored rather than
 * added. Where no debt points at the asset, the typed figure is all there is,
 * so it stands. Nothing is counted in both places, and nothing is dropped.
 */

export type AssetKind = "real_estate" | "vehicle";

export type ComposableAsset = {
  kind: AssetKind;
  id: string;
  name: string;
  value: number;
  /**
   * The loan figure stored on the asset record. Superseded by any debt row
   * secured against this asset, and used only when there is none.
   */
  embeddedLoan: number;
  /**
   * Rate and payment as typed onto the asset. The rate is kept at three
   * decimal places here and only two on the debt row, so 3.375% survives on
   * the asset and arrives as 3.37 on the debt — which is why the asset's own
   * rate is preferred when it has one.
   */
  embeddedRate?: number | null;
  embeddedPayment?: number | null;
};

export type ComposableLiability = {
  id: string;
  name: string;
  balance: number;
  debtType: string;
  securedByType: AssetKind | null;
  securedById: string | null;
  fromPlaid: boolean;
  rate?: number | null;
  monthlyPayment?: number | null;
};

export type AssetPosition = ComposableAsset & {
  owed: number;
  equity: number;
  /** Where `owed` came from, so the UI can say which figure it is showing. */
  owedSource: "linked" | "embedded" | "none";
  securedBy: { id: string; name: string; balance: number }[];
  /**
   * The loan terms to show on the asset's card.
   *
   * Read through the link rather than copied into the asset's own columns.
   * Writing the balance back would put the same number in two places again,
   * which is the arrangement that produced the double-count — and it would go
   * stale the moment a write failed or a sync raced one.
   *
   * The balance follows the debt because it changes; the rate stays with the
   * asset because it does not, and is stored there more precisely.
   */
  loan: {
    balance: number;
    rate: number | null;
    monthlyPayment: number | null;
    /** Null when nothing is linked, so the card can say the figure is typed. */
    from: { id: string; name: string } | null;
  } | null;
};

/**
 * An asset carrying a typed-in loan beside an unlinked debt that looks like
 * the same borrowing. Surfaced, never resolved automatically — only the owner
 * knows whether two loans against one car are one loan recorded twice or a
 * genuine second lien.
 */
export type SuspectedDuplicate = {
  assetKind: AssetKind;
  assetId: string;
  assetName: string;
  embeddedLoan: number;
  debtId: string;
  debtName: string;
  debtBalance: number;
  /** Why this pair was flagged, in words the owner can check. */
  reason: string;
  /** What the total is overstated by if they are the same loan. */
  overcount: number;
};

export type NetWorth = {
  investments: number;
  cash: number;
  assets: AssetPosition[];
  assetValue: number;
  assetEquity: number;
  /** Liabilities not secured against any tracked asset. */
  unsecured: number;
  /** Every liability, counted once. */
  liabilities: number;
  totalAssets: number;
  netWorth: number;
  suspectedDuplicates: SuspectedDuplicate[];
};

const n = (v: number | string | null | undefined) => {
  const x = Number(v ?? 0);
  return Number.isFinite(x) ? x : 0;
};

/** Debt types that could plausibly be secured against each kind of asset. */
const PLAUSIBLE: Record<AssetKind, string[]> = {
  vehicle: ["auto_loan", "personal_loan", "other_debt"],
  real_estate: ["mortgage", "heloc", "other_debt"],
};

/** Words too generic to count as evidence that two records are one loan. */
const NOISE = new Set([
  "loan", "the", "and", "llc", "inc", "card", "account", "new", "used",
]);

function tokens(name: string): Set<string> {
  return new Set(
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .split(" ")
      .filter((t) => t.length >= 3 && !NOISE.has(t))
  );
}

function sharedTokens(a: string, b: string): string[] {
  const t = tokens(b);
  return [...tokens(a)].filter((x) => t.has(x));
}

export function composeNetWorth(input: {
  investments: number;
  cash: number;
  assets: ComposableAsset[];
  liabilities: ComposableLiability[];
}): NetWorth {
  const { investments, cash, assets, liabilities } = input;

  const securedTo = new Map<string, ComposableLiability[]>();
  for (const l of liabilities) {
    if (!l.securedByType || !l.securedById) continue;
    const key = `${l.securedByType}|${l.securedById}`;
    const list = securedTo.get(key);
    if (list) list.push(l);
    else securedTo.set(key, [l]);
  }

  const positions: AssetPosition[] = assets.map((a) => {
    const linked = securedTo.get(`${a.kind}|${a.id}`) ?? [];

    // A linked debt is the live figure. The asset's own field is whatever was
    // typed once and is deliberately not added to it.
    const owed = linked.length > 0
      ? linked.reduce((s, l) => s + n(l.balance), 0)
      : n(a.embeddedLoan);

    // A rate or payment of zero is "not reported", not a real 0% loan — the
    // same reading that turned a missing cost basis into a gain of exactly
    // nothing. So a zero on the debt falls back to the asset's own figure
    // rather than overwriting it.
    const positive = (v: number | null | undefined) =>
      v !== null && v !== undefined && Number(v) > 0 ? Number(v) : null;

    const principal = linked[0];
    const loan =
      owed > 0 || linked.length > 0
        ? {
            balance: owed,
            rate: positive(a.embeddedRate) ?? positive(principal?.rate) ?? null,
            monthlyPayment:
              linked.reduce((s, l) => s + (positive(l.monthlyPayment) ?? 0), 0) ||
              positive(a.embeddedPayment) ||
              null,
            from:
              linked.length > 0
                ? { id: linked[0].id, name: linked.map((l) => l.name).join(", ") }
                : null,
          }
        : null;

    return {
      ...a,
      owed,
      equity: n(a.value) - owed,
      owedSource: linked.length > 0 ? "linked" : owed > 0 ? "embedded" : "none",
      securedBy: linked.map((l) => ({ id: l.id, name: l.name, balance: n(l.balance) })),
      loan,
    };
  });

  const unsecuredList = liabilities.filter((l) => !l.securedByType || !l.securedById);
  const unsecured = unsecuredList.reduce((s, l) => s + n(l.balance), 0);

  const assetValue = positions.reduce((s, p) => s + n(p.value), 0);
  const assetEquity = positions.reduce((s, p) => s + p.equity, 0);
  const securedTotal = positions.reduce(
    (s, p) => s + (p.owedSource === "linked" ? p.owed : 0),
    0
  );
  const embeddedTotal = positions.reduce(
    (s, p) => s + (p.owedSource === "embedded" ? p.owed : 0),
    0
  );

  const totalAssets = n(investments) + n(cash) + assetEquity;

  // ---- what looks like the same loan written down twice --------------------
  const suspectedDuplicates: SuspectedDuplicate[] = [];
  for (const p of positions) {
    // Only an asset still relying on its typed-in figure can be duplicated by
    // a debt row; once one is linked, the typed figure is already ignored.
    if (p.owedSource !== "embedded") continue;

    for (const l of unsecuredList) {
      if (!PLAUSIBLE[p.kind].includes(l.debtType)) continue;

      const exact = Math.abs(n(l.balance) - p.embeddedLoan) < 0.01;
      const shared = sharedTokens(p.name, l.name);
      if (!exact && shared.length < 2) continue;

      suspectedDuplicates.push({
        assetKind: p.kind,
        assetId: p.id,
        assetName: p.name,
        embeddedLoan: p.embeddedLoan,
        debtId: l.id,
        debtName: l.name,
        debtBalance: n(l.balance),
        reason: exact
          ? "the balances match to the cent"
          : `both name ${shared.slice(0, 3).join(", ")}`,
        // The typed figure is what would stop being subtracted a second time.
        overcount: p.embeddedLoan,
      });
    }
  }

  return {
    investments: n(investments),
    cash: n(cash),
    assets: positions,
    assetValue,
    assetEquity,
    unsecured,
    liabilities: unsecured + securedTotal + embeddedTotal,
    totalAssets,
    netWorth: totalAssets - unsecured,
    suspectedDuplicates,
  };
}
