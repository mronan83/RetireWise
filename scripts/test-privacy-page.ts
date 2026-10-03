/**
 * The privacy page names every party the code sends data to.
 *
 * On 2 Oct 2026 it named Supabase, Vercel, Plaid, the AI provider and
 * Upstash, while the code also sent ticker symbols to Yahoo Finance and VINs
 * to the NHTSA, and it said there were no third-party scripts while Plaid's
 * Link window loaded one. A page like this goes stale the day a dependency is
 * added, so this check reads the dependencies and every outbound request in
 * the code and fails when one has no name on the page.
 */
import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${ok || !detail ? "" : ` — ${detail}`}`);
  if (!ok) failures++;
}

/** Libraries that send data off the server or out of the browser, and the name the page must use. */
const SENDING_LIBRARIES: Record<string, string> = {
  plaid: "Plaid",
  "react-plaid-link": "Plaid",
  "yahoo-finance2": "Yahoo Finance",
  "@upstash/redis": "Upstash",
  "@upstash/ratelimit": "Upstash",
  stripe: "Stripe",
  "@ai-sdk/anthropic": "AI provider",
  "@ai-sdk/google": "AI provider",
  "@ai-sdk/openai": "AI provider",
  "@supabase/supabase-js": "Supabase",
  "@supabase/ssr": "Supabase",
};

/** Hosts the code calls directly, and the name the page must use. */
const CALLED_HOSTS: Record<string, string> = {
  "vpic.nhtsa.dot.gov": "National Highway Traffic Safety Administration",
};

/** Network-looking packages that only talk to RetireWise's own server. */
const LOCAL_ONLY = new Set([
  "ai", // the AI SDK core; calls go out through the @ai-sdk/* providers above
  "@ai-sdk/react", // the chat window's hooks, which call /api/chat
]);

/** Packages that look like network clients; a new one must be classified above. */
const NETWORK_HINT = /(sdk|api|client|analytics|sentry|segment|posthog|mixpanel|resend|sendgrid|twilio|finance|stripe|plaid|supabase|upstash|openai|anthropic)/i;

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : /\.(ts|tsx)$/.test(name) ? [path] : [];
  });
}

function main() {
  const page = readFileSync("src/app/legal/privacy/page.tsx", "utf8")
    .replace(/&apos;/g, "'")
    .replace(/\s+/g, " ");
  const deps = Object.keys(JSON.parse(readFileSync("package.json", "utf8")).dependencies ?? {});

  // ---- libraries ------------------------------------------------------------
  const unclassified = deps.filter((d) => NETWORK_HINT.test(d) && !(d in SENDING_LIBRARIES) && !LOCAL_ONLY.has(d));
  check(
    "every dependency that looks like a network client is classified here",
    unclassified.length === 0,
    `classify in scripts/test-privacy-page.ts: ${unclassified.join(", ")}`
  );
  const unnamed = [...new Set(deps.filter((d) => d in SENDING_LIBRARIES).map((d) => SENDING_LIBRARIES[d]))].filter(
    (name) => !page.includes(name)
  );
  check("the page names every service a library sends data to", unnamed.length === 0, `not named: ${unnamed.join(", ")}`);

  // ---- direct requests -------------------------------------------------------
  const hosts = new Set<string>();
  for (const file of files("src")) {
    const text = readFileSync(file, "utf8");
    for (const m of text.matchAll(/fetch\(/g)) {
      const after = text.slice(m.index!, m.index! + 240);
      const host = after.match(/https:\/\/([a-z0-9.-]+)/i)?.[1];
      if (host) hosts.add(host);
    }
  }
  const unknownHosts = [...hosts].filter((h) => !(h in CALLED_HOSTS));
  check(
    "every host the code calls directly is classified here",
    unknownHosts.length === 0,
    `classify in scripts/test-privacy-page.ts: ${unknownHosts.join(", ")}`
  );
  const unnamedHosts = [...hosts].filter((h) => h in CALLED_HOSTS && !page.includes(CALLED_HOSTS[h]));
  check("and the page names each of them", unnamedHosts.length === 0, `not named: ${unnamedHosts.map((h) => CALLED_HOSTS[h]).join(", ")}`);

  // ---- claims ------------------------------------------------------------------
  check(
    "the page does not claim there are no third-party scripts while Plaid's loads",
    !deps.includes("react-plaid-link") || !/no third-party scripts/i.test(page)
  );
  check("it says which script does load", !deps.includes("react-plaid-link") || /third-party script is Plaid/i.test(page));
  check("Vercel, which runs the application, is named", page.includes("Vercel"));

  console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILED`);
  return failures;
}

process.exit(main() === 0 ? 0 : 1);
