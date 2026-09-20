import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Use — RetireWise",
  description: "The terms on which RetireWise is provided.",
};

const UPDATED = "20 September 2026";

export default function TermsPage() {
  return (
    <>
      <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 text-sm">
        <p className="font-medium">This is a draft, not reviewed by a lawyer.</p>
        <p className="mt-1 text-muted-foreground">
          It was written to describe accurately how RetireWise actually works. It has
          not been reviewed by anyone qualified to write terms of use, and it should be
          before anyone relies on it.
        </p>
      </div>

      <h1 className="font-heading text-3xl font-bold tracking-tight">Terms of Use</h1>
      <p className="text-sm text-muted-foreground">Last updated {UPDATED}</p>

      <h2 className="font-heading text-xl font-semibold">What RetireWise is</h2>
      <p>
        RetireWise is a personal retirement planning tool, provided free of charge to
        friends and family of the person who operates it. There is no fee, no
        subscription and no paid tier. Nobody is charged for access, and no payment is
        accepted.
      </p>

      <h2 className="font-heading text-xl font-semibold">This is not financial advice</h2>
      <p>
        RetireWise produces projections, comparisons and written commentary about
        accounts and holdings you enter or link. None of it is investment, tax, legal or
        retirement advice, and none of it is a recommendation to buy, sell or hold any
        security.
      </p>
      <p>
        The person who operates RetireWise is not a registered investment adviser,
        broker-dealer, accountant or tax professional, is not compensated in any way for
        providing it, and is not acting in a fiduciary capacity toward you. Decisions
        about your money are yours, and are worth discussing with someone qualified and
        accountable.
      </p>

      <h2 className="font-heading text-xl font-semibold">Projections are estimates</h2>
      <p>
        Every forward-looking figure is the output of a model run on assumptions —
        returns, inflation, contributions, salary growth, claiming ages, spending. Those
        assumptions will be wrong to some degree, and small differences compound over
        decades into large ones. Past performance does not indicate future results. A
        projection is a way of comparing choices, not a forecast of what will happen.
      </p>

      <h2 className="font-heading text-xl font-semibold">Accuracy</h2>
      <p>
        Balances and holdings may come from your financial institutions through Plaid, or
        from figures you enter yourself. Neither is guaranteed to be current or correct.
        Data can be stale, an institution can report inconsistently, and an automated
        refresh can fail. Treat your institution&apos;s own statements as authoritative.
      </p>

      <h2 className="font-heading text-xl font-semibold">Your account</h2>
      <p>
        Keep your sign-in credentials to yourself. Anyone who can sign in as you, or who
        redeems a household invitation you issue, can see your complete financial
        position. Invitations are single-use and expire, and you can revoke an unused one
        at any time from Settings.
      </p>

      <h2 className="font-heading text-xl font-semibold">Availability</h2>
      <p>
        RetireWise is run on a best-effort basis by one person. It may be unavailable,
        may lose data, and may be discontinued at any time without notice. Export your
        data from Settings if you want a copy you control. It is not a system of record;
        keep your own.
      </p>

      <h2 className="font-heading text-xl font-semibold">No warranty, no liability</h2>
      <p>
        RetireWise is provided as is, without warranty of any kind, express or implied.
        To the fullest extent permitted by law, the operator is not liable for any loss
        arising from its use — including investment losses, lost data, or decisions made
        in reliance on anything it displays. Given that it is provided free of charge to
        people known personally to the operator, this allocation of risk is the basis on
        which it is offered at all.
      </p>

      <h2 className="font-heading text-xl font-semibold">Ending your use</h2>
      <p>
        You can stop at any time. Settings offers a full export of everything held about
        your household, and permanent deletion of it. The operator may also remove access
        at any time.
      </p>

      <h2 className="font-heading text-xl font-semibold">Changes</h2>
      <p>
        These terms may change. The date at the top reflects the most recent revision.
        Continued use after a change means the revised terms apply.
      </p>
    </>
  );
}
