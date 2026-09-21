/**
 * Three controls that said something untrue, and the rules that replace them.
 *
 *   1. Four cards on the AI Analysis page carried a "Phase 2" badge. Every
 *      one of them was built and wired — the tool exists, the chat calls it,
 *      and three of the four also generate an infographic. The badge told the
 *      owner of the app not to click four features he had already paid to
 *      have built.
 *   2. The Tax-Loss Harvesting card offered a scan to a household holding
 *      nothing taxable. Clicking it spent a round trip to be told the thing
 *      the app already knew before the click.
 *   3. "Try Demo" on the landing page pointed at /?demo=true, which the proxy
 *      ignores unless NEXT_PUBLIC_DEMO_ENABLED is "true". In production it was
 *      not, so the button did nothing at all: no navigation, no error, no
 *      explanation.
 *
 * Every assertion is written as the bug, so a regression reads as the old
 * behaviour returning.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  hasTaxableAccount,
  isTaxable,
  taxableHoldings,
} from "../src/lib/utils/taxability";

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${ok || !detail ? "" : ` — ${detail}`}`);
  if (!ok) failures++;
}

const root = join(__dirname, "..");
const read = (p: string) => readFileSync(join(root, p), "utf8");

function main() {
  // ---- taxability is decided once, by the column that records it ----------
  const deferred = { taxTreatment: "tax_deferred" };
  const free = { taxTreatment: "tax_free" };
  const taxable = { taxTreatment: "taxable" };

  check("a taxable account is taxable", isTaxable(taxable));
  check("a 401(k) is not", !isTaxable(deferred));
  check("nor is a Roth", !isTaxable(free));

  // The household as it actually stands: two Roths and three 401(k)s.
  const household = [free, deferred, deferred, deferred, free];
  check(
    "a household of Roths and 401(k)s has no taxable account",
    !hasTaxableAccount(household)
  );
  check(
    "adding one taxable brokerage changes that",
    hasTaxableAccount([...household, taxable])
  );
  check("and an empty household has none", !hasTaxableAccount([]));

  // ---- the two ways the old account_type inference got it wrong -----------
  // It read: type === "brokerage" || type === "other".
  const oldRule = (t: string) => t === "brokerage" || t === "other";

  const otherButTaxFree = {
    accountType: "other",
    accountTaxTreatment: "tax_free",
    ticker: "HSA-FUND",
  };
  check(
    "an account typed 'other' but treated tax-free used to be scanned",
    oldRule(otherButTaxFree.accountType),
    "the inference said taxable; the column says tax-free"
  );
  check(
    "it is not scanned now",
    taxableHoldings([otherButTaxFree]).length === 0
  );

  const taxableButOddlyTyped = {
    accountType: "annuity",
    accountTaxTreatment: "taxable",
    ticker: "VTI",
  };
  check(
    "a taxable account typed outside that pair used to be skipped",
    !oldRule(taxableButOddlyTyped.accountType),
    "a real harvest opportunity, silently omitted"
  );
  check(
    "it is scanned now",
    taxableHoldings([taxableButOddlyTyped]).length === 1
  );
  check(
    "and the two disagreements are not symmetric — both were losses",
    taxableHoldings([otherButTaxFree, taxableButOddlyTyped])[0].ticker === "VTI"
  );

  // ---- the page and the scanner must not disagree -------------------------
  // The card is offered from hasTaxableAccount; the scan runs taxableHoldings.
  // If a household passes the first and fails the second, the app invites a
  // question it cannot answer.
  const accountsOf = (hs: { accountTaxTreatment: string }[]) =>
    hs.map((h) => ({ taxTreatment: h.accountTaxTreatment }));
  for (const holdings of [
    [otherButTaxFree],
    [taxableButOddlyTyped],
    [otherButTaxFree, taxableButOddlyTyped],
    [],
  ]) {
    check(
      `card offered ⇔ scan has something to scan (${holdings.length} holdings)`,
      hasTaxableAccount(accountsOf(holdings)) === (taxableHoldings(holdings).length > 0)
    );
  }

  // ---- no card claims to be unbuilt ---------------------------------------
  const cards = read("src/app/(dashboard)/analysis/analysis-cards.tsx");
  check(
    "no card is still badged 'Phase 2'",
    !cards.includes("Phase 2"),
    "four features that exist were labelled as not yet built"
  );

  // Each of the four had a working tool behind it. Named here so removing a
  // tool without removing its card fails rather than shipping a dead button.
  const chatRoute = read("src/app/api/chat/route.ts");
  for (const [card, tool] of [
    ["Rebalancing Trades", "generateRebalancingTradesTool"],
    ["Tax-Loss Harvesting", "scanTaxLossHarvestingTool"],
    ["Benchmark Comparison", "compareBenchmarksTool"],
    ["Dividend Income", "getDividendIncomeTool"],
  ] as const) {
    check(
      `${card} has a tool the chat route actually registers`,
      chatRoute.includes(tool),
      tool
    );
  }

  // Three of the four also generate an infographic; the report route has to
  // know the type the card asks for or the button opens an error page.
  const reportRoute = read("src/app/api/report/analysis/route.ts");
  const declared = [...cards.matchAll(/reportType: "([a-z_]+)"/g)].map((m) => m[1]);
  check("the cards declare report types at all", declared.length > 0, String(declared.length));
  for (const type of declared) {
    check(
      `the report route handles "${type}"`,
      new RegExp(`\\b${type}:`).test(reportRoute)
    );
  }

  // ---- the harvesting card states its requirement --------------------------
  check(
    "the Tax-Loss Harvesting card declares what it needs",
    /requires: "taxable_account"/.test(cards)
  );
  check(
    "and carries the explanation shown when the household has none",
    /unavailableDetail:/.test(cards)
  );
  check(
    "an unavailable card is not clickable",
    /onClick=\{available \? \(\) => handleChat/.test(cards),
    "a dead end reached by click is the thing being removed"
  );
  check(
    "and offers no report button either",
    /option\.reportType && available/.test(cards),
    "a PDF that says 'not applicable' is a slower dead end"
  );

  // ---- the demo entrance is offered only where it opens -------------------
  const landing = read("src/app/page.tsx");
  const proxy = read("src/proxy.ts");
  const FLAG = 'process.env.NEXT_PUBLIC_DEMO_ENABLED === "true"';

  check(
    "the proxy still gates demo entry on the flag",
    proxy.includes(FLAG),
    "if this goes, demo mode is an auth bypass that is on by default"
  );
  check(
    "the landing page gates the Try Demo link on the same flag",
    landing.includes(FLAG),
    "it used to render the link unconditionally"
  );
  check(
    "the link is inside that gate, not beside it",
    /\{demoEnabled && \(\s*<Link href="\/\?demo=true">/.test(landing)
  );

  // The failure exactly as it presented: flag off, link clicked, nothing.
  const proxyHonoursDemo = (flag: string | undefined, search: string) =>
    search === "demo=true" && flag === "true";
  check(
    "with the flag unset, /?demo=true does nothing",
    !proxyHonoursDemo(undefined, "demo=true"),
    "which is why the button must not be there to click"
  );
  check(
    "with the flag set, it opens the demo",
    proxyHonoursDemo("true", "demo=true")
  );
  check(
    "a truthy-looking value that is not \"true\" still does nothing",
    !proxyHonoursDemo("1", "demo=true"),
    "the gate is an exact string comparison, deliberately"
  );

  // ---- what turning demo mode on would have opened ------------------------
  // The reason the flag was off is not that the button was broken. Seven POST
  // handlers ran under withApiHousehold, the READ wrapper. Signed in that is
  // right; in demo mode getApiUserId resolves to DEMO_CLERK_ID, so each of
  // them would have written to the seeded household for an anonymous visitor.
  const writeRoutes: [string, string][] = [
    ["src/app/api/account/delete/route.ts", "delete the demo household outright"],
    ["src/app/api/settings/projection-controls/route.ts", "rewrite the demo projection settings"],
    ["src/app/api/settings/ai-provider/route.ts", "store an API key in the demo household"],
    ["src/app/api/plaid/create-link-token/route.ts", "spend Plaid link quota anonymously"],
    ["src/app/api/plaid/exchange-token/route.ts", "attach a stranger's real Plaid item to this database"],
    ["src/app/api/alerts/dismiss/route.ts", "dismiss another visitor's alerts"],
    ["src/app/api/alerts/dismiss-all/route.ts", "dismiss all of them"],
  ];
  for (const [file, damage] of writeRoutes) {
    const src = read(file);
    const post = src.slice(src.indexOf("export async function POST"));
    check(
      `POST ${file.replace("src/app/api", "").replace("/route.ts", "")} runs under the write wrapper`,
      /return withApiWriteHousehold\(/.test(post),
      `under the read wrapper a demo visitor could ${damage}`
    );
  }

  const helpers = read("src/lib/auth-helpers.ts");
  check(
    "the write wrapper exists and refuses demo mode",
    /export async function withApiWriteHousehold[\s\S]*?ctx\.isDemo[\s\S]*?status: 403/.test(
      helpers
    )
  );
  check(
    "it still answers 401 when signed out, not 403",
    /export async function withApiWriteHousehold[\s\S]*?if \(!ctx\) return Response\.json\(\s*\{ error: "Unauthorized" \}, \{ status: 401 \}/.test(
      helpers
    )
  );
  check(
    "and the read wrapper does not refuse demo mode — reading is the point",
    !/export async function withApiHousehold\(\s*fn[\s\S]*?isDemo/.test(
      helpers.slice(helpers.indexOf("export async function withApiHousehold"))
    )
  );
  check(
    "the tenant-scope check knows the new wrapper",
    read("scripts/check-tenant-scope.ts").includes('"withApiWriteHousehold"'),
    "otherwise every route moved to it reads as newly unscoped"
  );

  // Exit is ungated on purpose: someone already inside must always be able to
  // leave, including after the flag is turned off under them.
  check(
    "leaving demo mode is not gated on the flag",
    /searchParams\.get\("demo"\) === "false"[\s\S]{0,80}cookies\.delete\("demo"\)/.test(
      proxy.replace(/\n/g, "\n")
    ) || proxy.includes('cookies.delete("demo")'),
    "turning the flag off must not strand a visitor inside"
  );

  console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILED`);
  return failures;
}

process.exit(main() === 0 ? 0 : 1);
