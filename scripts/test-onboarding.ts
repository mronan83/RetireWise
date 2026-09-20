/**
 * The setup checklist, and what it gates.
 *
 * Its job is to stop a projection being believed before its inputs exist. A
 * household with no contributions recorded still gets a chart with a number
 * on it — one that quietly assumes they never save another dollar — and
 * nothing about the rendering distinguishes that from a real answer.
 */
import { randomUUID } from "crypto";
import { sql } from "drizzle-orm";
import { getBaseDb } from "../src/lib/db";
import { withTenant } from "../src/lib/db/tenant";
import {
  accounts,
  contributions,
  holdings,
  households,
  userPreferences,
} from "../src/lib/db/schema";
import { getOnboardingState } from "../src/lib/onboarding";

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${ok || !detail ? "" : ` — ${detail}`}`);
  if (!ok) failures++;
}

const U = `onb_${randomUUID()}`;
let accountId = "";

const state = () => withTenant(U, U, () => getOnboardingState(U));

async function cleanup() {
  const base = getBaseDb();
  if (accountId) {
    await base.delete(holdings).where(sql`${holdings.accountId} = ${accountId}`);
    await base.delete(contributions).where(sql`${contributions.clerkId} = ${U}`);
  }
  await base.delete(accounts).where(sql`${accounts.clerkId} = ${U}`);
  await base.delete(userPreferences).where(sql`${userPreferences.clerkId} = ${U}`);
  await base.delete(households).where(sql`${households.primaryClerkId} = ${U}`);
}

async function main() {
  const base = getBaseDb();

  // ---- a household that has done nothing ---------------------------------
  const blank = await state();
  check("a brand-new household reads as empty", blank.empty);
  check("nothing is ticked", blank.completed === 0, `${blank.completed}`);
  check(
    "a projection is not yet worth believing",
    blank.projectionTrustworthy === false
  );
  check(
    "the first step offered is the age and retirement target",
    blank.next?.id === "profile",
    blank.next?.id
  );

  // ---- profile only -------------------------------------------------------
  await base.insert(userPreferences).values({ clerkId: U, currentAge: 44, retirementAge: 62 });
  let s = await state();
  check("entering an age and target no longer reads as empty", s.empty === false);
  check("the profile step is done", s.steps.find((x) => x.id === "profile")?.done === true);
  check(
    "and it reports what was entered rather than a bare tick",
    s.steps.find((x) => x.id === "profile")?.detail === "Age 44, retiring at 62"
  );
  check("a projection is still not trustworthy", s.projectionTrustworthy === false);

  // ---- an account, but nothing in it --------------------------------------
  const [acct] = await base
    .insert(accounts)
    .values({
      clerkId: U,
      name: "Test Brokerage",
      institution: "Test",
      accountType: "brokerage",
      taxTreatment: "taxable",
    })
    .returning({ id: accounts.id });
  accountId = acct.id;

  s = await state();
  check("the accounts step is done", s.steps.find((x) => x.id === "accounts")?.done === true);
  check(
    "an empty account does not count as having balances",
    s.steps.find((x) => x.id === "balances")?.done === false
  );
  check("still not trustworthy", s.projectionTrustworthy === false);

  // ---- holdings -----------------------------------------------------------
  await base.insert(holdings).values({
    accountId: acct.id,
    ticker: "VTI",
    name: "Total Market",
    assetClass: "us_stock",
    shares: "100",
    costBasisPerShare: "200",
    currentPrice: "250",
    currentValue: "25000",
  });

  s = await state();
  check("balances are now recorded", s.steps.find((x) => x.id === "balances")?.done === true);
  check(
    "but a portfolio with no contributions is still not trustworthy — this is the one people miss",
    s.projectionTrustworthy === false
  );
  check(
    "and the checklist says contributions are what is missing",
    s.next?.id === "contributions",
    s.next?.id
  );

  // ---- contributions ------------------------------------------------------
  await base.insert(contributions).values({
    clerkId: U,
    accountId: acct.id,
    owner: "self",
    label: "401k",
    accountType: "401k",
    contributionMethod: "fixed_amount",
    contributionAmount: "1000",
  });

  s = await state();
  check("contributions are recorded", s.steps.find((x) => x.id === "contributions")?.done === true);
  check("a projection is now worth believing", s.projectionTrustworthy === true);
  check(
    "the projection step unlocks on its inputs rather than being ticked off",
    s.steps.find((x) => x.id === "projection")?.done === true
  );
  check(
    "salary is encouraged but never blocks",
    s.steps.find((x) => x.id === "income")?.required === false &&
      s.steps.find((x) => x.id === "income")?.done === false
  );
  check("the checklist is not claimed complete", s.completed < s.total, `${s.completed}/${s.total}`);

  await cleanup();
  console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILED`);
  return failures;
}

main()
  .then((f) => process.exit(f === 0 ? 0 : 1))
  .catch(async (e) => {
    console.error(e);
    try { await cleanup(); } catch { /* best effort */ }
    process.exit(1);
  });
