import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy — RetireWise",
  description: "What RetireWise stores, why, and how to get it back or erase it.",
};

const UPDATED = "20 September 2026";

export default function PrivacyPage() {
  return (
    <>
      <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 text-sm">
        <p className="font-medium">This is a draft, not reviewed by a lawyer.</p>
        <p className="mt-1 text-muted-foreground">
          It describes what the software actually does, verified against the code and the
          database rather than written from a template. It has not been reviewed by
          anyone qualified to write a privacy policy, and it should be before anyone
          relies on it.
        </p>
      </div>

      <h1 className="font-heading text-3xl font-bold tracking-tight">Privacy</h1>
      <p className="text-sm text-muted-foreground">Last updated {UPDATED}</p>

      <p>
        RetireWise holds a detailed picture of your finances. This page says what that
        is, where it goes, and how to take it back.
      </p>

      <h2 className="font-heading text-xl font-semibold">What is stored</h2>
      <ul className="list-disc space-y-1 pl-5">
        <li>
          <strong>Sign-in details</strong> — your email address, held by Supabase Auth.
          Passwords are never visible to RetireWise.
        </li>
        <li>
          <strong>Financial data</strong> — accounts, holdings, transactions, balances,
          contributions, debts, property, vehicles, cash, Social Security estimates, and
          the historical snapshots built from them.
        </li>
        <li>
          <strong>Planning inputs</strong> — ages, retirement targets, salaries, risk
          tolerance, spending assumptions.
        </li>
        <li>
          <strong>Household membership</strong> — who shares a household, and the
          invitations issued to form it. Only a hash of each invitation code is stored,
          never the code.
        </li>
        <li>
          <strong>Credentials for connected services</strong> — Plaid access tokens and
          the AI provider API key you supply, both encrypted at rest with AES-256-GCM.
        </li>
        <li>
          <strong>An audit trail</strong> — a record of actions that change who can reach
          your data: invitations issued, revoked and redeemed, institutions linked and
          disconnected, API keys stored and removed. The action, never the key.
        </li>
      </ul>

      <h2 className="font-heading text-xl font-semibold">Where it goes</h2>
      <ul className="list-disc space-y-1 pl-5">
        <li>
          <strong>Supabase</strong> — hosts the database and authentication.
        </li>
        <li>
          <strong>Vercel</strong> — runs the application.
        </li>
        <li>
          <strong>Plaid</strong> — connects to your financial institutions, if you choose
          to link one. You can use RetireWise entirely with manual entry and CSV import
          and never involve Plaid at all.
        </li>
        <li>
          <strong>Your AI provider</strong> — when you use the AI features, the portfolio
          context for that question is sent to the provider whose API key you supplied,
          on your own account. RetireWise does not run AI on anyone else&apos;s key,
          which means your usage is billed to you and governed by your agreement with
          that provider.
        </li>
        <li>
          <strong>Upstash</strong> — caches market prices and rate-limits the AI chat, if
          configured. It holds no financial data.
        </li>
      </ul>
      <p>
        Nothing is sold. Nothing is shared with advertisers. There is no analytics or
        tracking of any kind, and no third-party scripts in the application.
      </p>

      <h2 className="font-heading text-xl font-semibold">Who can see it</h2>
      <p>
        Your data is reachable by you, by anyone who joins your household through an
        invitation you issue, and by the operator of this deployment, who has
        administrative access to the database as a technical necessity of running it.
      </p>
      <p>
        Between households, separation is enforced by the database itself: each request
        runs under a restricted role with row-level security policies keyed to your
        household, so a query that failed to filter correctly would return nothing rather
        than someone else&apos;s data.
      </p>

      <h2 className="font-heading text-xl font-semibold">How long it is kept</h2>
      <p>
        For as long as you use RetireWise, and until you delete it. Historical snapshots
        are kept indefinitely because they are what makes long-run comparison possible;
        deleting your data deletes them too.
      </p>

      <h2 className="font-heading text-xl font-semibold">Getting it back, or erasing it</h2>
      <p>
        Settings offers both, without asking anyone:
      </p>
      <ul className="list-disc space-y-1 pl-5">
        <li>
          <strong>Export</strong> — one JSON file with every row held for your household.
          Encrypted credentials are deliberately excluded; the file reports which exist
          rather than including them.
        </li>
        <li>
          <strong>Delete</strong> — permanent erasure of every row, not a hidden flag.
          Your sign-in itself lives with the authentication provider and is removed
          separately.
        </li>
      </ul>
      <p>
        Deleted rows may persist in database backups until those backups age out.
      </p>

      <h2 className="font-heading text-xl font-semibold">Security, honestly stated</h2>
      <p>
        Credentials are encrypted at rest, traffic is encrypted in transit, household
        separation is enforced at the database level, and invitation codes are generated
        with a cryptographic random source, expire, and can only be used once.
      </p>
      <p>
        What this is not: RetireWise has not had a third-party security audit, holds no
        compliance certification, and is operated by one person rather than a team with
        an on-call rotation. It is built carefully; it is not a bank.
      </p>

      <h2 className="font-heading text-xl font-semibold">If something goes wrong</h2>
      <p>
        If data is exposed, the operator will contact affected households directly with
        what is known, what was reached, and what to do — promptly, and without waiting
        until the picture is complete.
      </p>

      <h2 className="font-heading text-xl font-semibold">Questions</h2>
      <p>
        Ask the person who gave you access. RetireWise is run by one person, and that
        person is them.
      </p>
    </>
  );
}
