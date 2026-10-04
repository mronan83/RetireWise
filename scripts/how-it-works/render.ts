/**
 * The "How RetireWise works" page: docs/HOW-IT-WORKS.md, with its figures
 * filled from the code, its ```widget fences turned into calculators that
 * run the production engine, and its code map linked to the source.
 */
import { anchor, esc, makeInline, REPO_URL } from "../pages/inline";
import { renderBlocks, type Block, type Entry, type Section } from "../pages/markdown";
import { BASE_CSS, DOC_CSS, FONTS } from "../pages/theme";
import type { Engine } from "./bundle";
import { DOC_FILE, fillFacts, parseHowDoc, type HowReport } from "./model";

export type HowRelease = {
  sha: string;
  date: string;
  previousSha?: string;
  firstPublication: boolean;
  changes: string[];
  preview?: boolean;
};

const money = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
const pctText = (n: number) => `${Number(n.toFixed(2))}%`;

/** Tables of what the code assumes, read from the engine itself. */
function assumptions(e: Engine): string {
  const t = e.DEFAULT_TAX_TABLE;
  const scen = e.MARKET_SCENARIOS.map(
    (s) => `<tr><td>${esc(s.name)}</td><td class="num">${pctText(s.returnPct)}</td><td class="num">${pctText(s.volatility)}</td><td class="num">${pctText(s.inflationPct)}</td><td>${esc(s.description)}</td></tr>`
  ).join("");
  const profiles = e.RISK_PROFILE_ORDER.map((id) => {
    const p = e.RISK_PROFILES[id];
    return `<tr><td>${esc(p.label)}</td><td class="num">${pctText(p.stockPct)}</td><td class="num">${pctText(p.returnPct)}</td><td class="num">${pctText(p.volatility)}</td></tr>`;
  }).join("");
  let prev = 0;
  const brackets = t.brackets
    .map((b) => {
      const row = `<tr><td class="num">${pctText(b.rate * 100)}</td><td class="num">${money(prev)}</td><td class="num">${b.limit === Infinity ? "and above" : money(b.limit)}</td></tr>`;
      prev = b.limit;
      return row;
    })
    .join("");
  const limits = Object.entries(e.IRS_LIMITS)
    .map(([, v]) => `<tr><td>${esc(v.label)}</td><td class="num">${money(v.under50)}</td><td class="num">${money(v.over50)}</td><td class="num">${money(v.age60to63)}</td></tr>`)
    .join("");
  const ages = Array.from({ length: 28 }, (_, i) => 73 + i);
  const rmd = ages.map((a) => `<td class="num">${(1 / e.calculateRMD(1, a)).toFixed(1)}</td>`).join("");
  const ss = [62, 63, 64, 65, 66, 67, 68, 69, 70].map((a) => `<td class="num">${Math.round(e.adjustSSBenefit(1000, 67, a) / 10)}%</td>`).join("");
  return `<div class="assume">
<h3 id="a-scenarios">Market scenarios</h3>
<div class="scroll"><table class="plain"><thead><tr><th>Scenario</th><th>Return a year</th><th>Volatility</th><th>Inflation</th><th>Described as</th></tr></thead><tbody>${scen}</tbody></table></div>
<h3 id="a-profiles">Glide path risk profiles</h3>
<div class="scroll"><table class="plain"><thead><tr><th>Profile</th><th>Stocks</th><th>Return a year</th><th>Volatility</th></tr></thead><tbody>${profiles}</tbody></table></div>
<h3 id="a-tax">Federal tax, married filing jointly, ${t.taxYear} (${esc(t.source)})</h3>
<p class="note">Standard deduction ${money(t.standardDeduction)}. Brackets apply to income after the deduction, in today's dollars; the engine rises them with inflation.</p>
<div class="scroll"><table class="plain"><thead><tr><th>Rate</th><th>From</th><th>To</th></tr></thead><tbody>${brackets}</tbody></table></div>
<h3 id="a-limits">IRS contribution limits on the employee's own deferral</h3>
<div class="scroll"><table class="plain"><thead><tr><th>Account</th><th>Under 50</th><th>50 and over</th><th>60 to 63</th></tr></thead><tbody>${limits}</tbody></table></div>
<h3 id="a-rmd">Required minimum distribution divisors</h3>
<p class="note">The distribution is the tax-deferred balance divided by the divisor for that age, from age ${e.RMD_START_AGE}.</p>
<div class="scroll"><table class="plain mini"><thead><tr><th>Age</th>${ages.map((a) => `<th class="num">${a}</th>`).join("")}</tr></thead><tbody><tr><td>Divisor</td>${rmd}</tr></tbody></table></div>
<h3 id="a-ss">Social Security by claiming age, full retirement age 67</h3>
<div class="scroll"><table class="plain mini"><thead><tr><th>Age</th>${[62, 63, 64, 65, 66, 67, 68, 69, 70].map((a) => `<th class="num">${a}</th>`).join("")}</tr></thead><tbody><tr><td>Share of full benefit</td>${ss}</tr></tbody></table></div>
<h3 id="a-risk">Expected return by stated risk tolerance (Analytics and the assistant)</h3>
<div class="scroll"><table class="plain"><thead><tr><th>Risk tolerance</th><th>Return a year</th></tr></thead><tbody>${Object.entries(e.RETURN_BY_RISK)
    .map(([k, v]) => `<tr><td>${esc(k[0].toUpperCase() + k.slice(1))}</td><td class="num">${pctText(v)}</td></tr>`)
    .join("")}</tbody></table></div>
</div>`;
}

/** The skeleton each calculator fills in when the page loads. */
function widget(name: string, e: Engine): string {
  const num = (id: string, label: string, attrs = "") =>
    `<label class="fld" for="${id}"><span>${label}</span><input id="${id}" type="number" inputmode="decimal" ${attrs}></label>`;
  switch (name) {
    case "playground":
      return `<div class="play" id="w-playground">
<form class="controls" id="pg-form" aria-label="The household">
  <fieldset><legend>You</legend>${num("pg-age", "Age", 'min="20" max="80" step="1"')}${num("pg-retirementAge", "Retire at", 'min="40" max="80" step="1"')}${num("pg-salary", "Salary, a year", 'min="0" step="1000"')}${num("pg-salaryGrowthPct", "Raises, % a year", 'min="0" max="10" step="0.5"')}</fieldset>
  <fieldset><legend>Partner</legend><label class="chk" for="pg-hasPartner"><input id="pg-hasPartner" type="checkbox"> <span>Has a partner</span></label>${num("pg-partnerAge", "Partner's age", 'min="20" max="80" step="1"')}</fieldset>
  <fieldset><legend>Savings</legend>${num("pg-pretaxBalance", "401(k) balance", 'min="0" step="1000"')}${num("pg-deferralPct", "Deferring, % of salary", 'min="0" max="50" step="0.5"')}${num("pg-matchRatePct", "Employer match, % of deferral", 'min="0" max="200" step="5"')}${num("pg-matchUpToPct", "Matched up to, % of salary", 'min="0" max="20" step="0.5"')}${num("pg-rothBalance", "Roth IRA balance", 'min="0" step="1000"')}${num("pg-rothAnnual", "Roth IRA, a year", 'min="0" step="500"')}${num("pg-taxableBalance", "Brokerage balance", 'min="0" step="1000"')}</fieldset>
  <fieldset><legend>Retirement</legend>${num("pg-monthlySpending", "Spending a month, today's dollars", 'min="0" step="100"')}${num("pg-selfSSAtFRA", "Social Security at full age, a month", 'min="0" step="50"')}${num("pg-partnerSSAtFRA", "Partner's, a month", 'min="0" step="50"')}${num("pg-claimAgeSelf", "You claim at", 'min="62" max="70" step="1"')}${num("pg-claimAgePartner", "Partner claims at", 'min="62" max="70" step="1"')}${num("pg-retirementYears", "Years in retirement", 'min="5" max="50" step="1"')}</fieldset>
  <fieldset><legend>Markets and method</legend><label class="fld wide" for="pg-scenarioId"><span>Market scenario</span><select id="pg-scenarioId">${e.MARKET_SCENARIOS.map((s) => `<option value="${esc(s.id)}">${esc(s.name)}</option>`).join("")}</select></label><label class="fld wide" for="pg-withdrawalMethod"><span>Withdraw</span><select id="pg-withdrawalMethod"><option value="expense">What spending needs</option><option value="rate">A fixed rate of savings</option><option value="higher">Whichever is higher</option></select></label>${num("pg-withdrawalRatePct", "Rate, % of savings", 'min="1" max="10" step="0.25"')}<label class="chk" for="pg-glidePath"><input id="pg-glidePath" type="checkbox"> <span>Glide path (less in stocks with age)</span></label><label class="chk" for="pg-catchUp"><input id="pg-catchUp" type="checkbox"> <span>Catch-up contributions from 50</span></label></fieldset>
  <button type="button" class="btn" id="pg-reset">Back to the example</button>
</form>
<div class="results" aria-live="polite">
  <p class="example-flag" id="pg-flag">An example household, not anyone's real figures. Change anything; the production engine recalculates.</p>
  <div class="tiles">
    <div class="tile hero"><span class="l">Savings last in</span><span class="v" id="pg-odds">–</span><span class="d" id="pg-odds-sub"></span></div>
    <div class="tile"><span class="l">At retirement, steady market</span><span class="v" id="pg-atret">–</span><span class="d">future dollars</span></div>
    <div class="tile"><span class="l">At retirement, middle market</span><span class="v" id="pg-median">–</span><span class="d" id="pg-range"></span></div>
    <div class="tile"><span class="l">In the steady market</span><span class="v" id="pg-lasts">–</span><span class="d" id="pg-lasts-sub"></span></div>
  </div>
  <figure class="chart" id="pg-fan"><figcaption><b>Savings by age</b><span class="note">Future dollars. The bands hold the middle 50% and 80% of the simulated markets.</span></figcaption><div class="legend" id="pg-fan-legend"></div><div class="plot"></div></figure>
  <figure class="chart" id="pg-flows"><figcaption><b>Each retirement year: what is spent, and where it comes from</b><span class="note">Future dollars, steady market.</span></figcaption><div class="legend" id="pg-flows-legend"></div><div class="plot"></div></figure>
  <details class="yt"><summary>Year by year, in a table</summary><div class="scroll"><table class="plain" id="pg-table"></table></div></details>
</div>
</div>`;
    case "year":
      return `<div class="widget" id="w-year"><div class="wrow"><label class="fld grow" for="yr-age"><span>Take apart the year the example household turns <output id="yr-age-out"></output></span><input id="yr-age" type="range" min="0" max="0" step="1"></label></div><div class="scroll"><table class="plain ledger" id="yr-ledger"></table></div><p class="note" id="yr-note"></p></div>`;
    case "ss-claiming":
      return `<div class="widget" id="w-ss"><div class="wrow">${num("ss-benefit", "Benefit at full retirement age, a month", 'min="0" step="50"')}${num("ss-fra", "Full retirement age", 'min="66" max="67" step="1"')}<label class="fld grow" for="ss-age"><span>Claim at <output id="ss-age-out"></output></span><input id="ss-age" type="range" min="62" max="70" step="1"></label></div><p class="readout" id="ss-out"></p><div class="plot" id="ss-plot"></div></div>`;
    case "tax":
      return `<div class="widget" id="w-tax"><div class="wrow">${num("tx-ordinary", "Taken from tax-deferred savings", 'min="0" step="1000"')}${num("tx-ss", "Social Security received", 'min="0" step="1000"')}${num("tx-years", "Years from now", 'min="0" max="50" step="1"')}${num("tx-inflation", "Inflation, % a year", 'min="0" max="10" step="0.5"')}</div><div class="scroll"><table class="plain ledger" id="tx-ledger"></table></div></div>`;
    case "rmd":
      return `<div class="widget" id="w-rmd"><div class="wrow">${num("rmd-balance", "Tax-deferred balance at the end of last year", 'min="0" step="10000"')}${num("rmd-age", "Age this year", 'min="60" max="105" step="1"')}</div><p class="readout" id="rmd-out"></p></div>`;
    case "glide-path":
      return `<div class="widget" id="w-glide"><div class="wrow"><label class="fld" for="gp-start"><span>Start as</span><select id="gp-start">${e.RISK_PROFILE_ORDER.map((id) => `<option value="${id}">${esc(e.RISK_PROFILES[id].label)}</option>`).join("")}</select></label><label class="fld" for="gp-end"><span>End as</span><select id="gp-end">${e.RISK_PROFILE_ORDER.map((id) => `<option value="${id}">${esc(e.RISK_PROFILES[id].label)}</option>`).join("")}</select></label>${num("gp-from", "Shift from age", 'min="20" max="90" step="1"')}${num("gp-to", "Until age", 'min="20" max="95" step="1"')}<label class="fld" for="gp-curve"><span>Shape</span><select id="gp-curve"><option value="linear">Steady</option><option value="accelerated">Slow, then faster</option></select></label></div><p class="readout" id="gp-out"></p><div class="plot" id="gp-plot"></div></div>`;
    case "monte-carlo":
      return `<div class="widget" id="w-mc"><p class="note">The example household above, as it stands now, under each market scenario: the share of simulated markets in which its savings last.</p><div class="plot" id="mc-plot"></div></div>`;
    case "assumptions":
      return assumptions(e);
    default:
      return "";
  }
}

export function renderHowPage(markdown: string, values: Record<string, string>, e: Engine, engineJs: string, report: HowReport, r: HowRelease): string {
  const h = parseHowDoc(fillFacts(markdown, values));
  const moduleOf = new Map(report.coverage.flatMap((c) => c.functions.map((f) => [f, c.module] as [string, string])));
  const local = new Map<string, string>([...moduleOf.keys()].map((f) => [f, `fn-${f}`] as [string, string]));
  const inline = makeInline(r.sha, local);
  const commit = (sha: string) => `<a href="${REPO_URL}/commit/${esc(sha)}" target="_blank" rel="noopener"><code>${esc(sha.slice(0, 7))}</code></a>`;
  const fileAt = (path: string, label = path) =>
    `<a class="file" href="${REPO_URL}/blob/${esc(r.sha)}/${path.split("/").map(encodeURIComponent).join("/")}" target="_blank" rel="noopener"><code>${esc(label)}</code></a>`;

  const blocks = (bs: Block[]) =>
    bs
      .map((b) => {
        if (b.kind === "code" && b.lang === "widget") return widget(b.text.trim(), e);
        if (b.kind === "code" && b.lang === "formula") return `<pre class="formula"><code>${esc(b.text)}</code></pre>`;
        return renderBlocks([b], inline);
      })
      .join("\n");
  const fields = (f: Record<string, string>) => {
    const keys = Object.keys(f);
    return keys.length ? `<dl class="fields">${keys.map((k) => `<dt>${esc(k)}</dt><dd>${inline(f[k])}</dd>`).join("")}</dl>` : "";
  };
  const entry = (en: Entry, sectionId: string) =>
    `<article class="entry" id="${sectionId}-${anchor(en.title)}"><h3>${inline(en.title)}</h3>${blocks(en.blocks)}${fields(en.fields)}</article>`;

  const codeMap = (s: Section) => {
    const table = s.blocks.find((b): b is Extract<Block, { kind: "table" }> => b.kind === "table");
    const rest = s.blocks.filter((b) => b !== table);
    const rows = (table?.rows ?? [])
      .map((row) => {
        const fn = row[0].replace(/`/g, "").trim();
        const mod = moduleOf.get(fn);
        return `<tr id="fn-${esc(fn)}"><td class="nowrap"><code>${esc(fn)}</code></td><td>${inline(row[1] ?? "")}</td><td class="src">${mod ? fileAt(mod, mod.replace(/^src\/lib\//, "")) : ""}</td></tr>`;
      })
      .join("");
    return `${blocks(rest)}<div class="filterbar" role="search"><label for="cm-q" class="sr">Filter functions</label><input id="cm-q" type="search" placeholder="Filter: a function, a module, a word…" autocomplete="off"></div><div class="scroll"><table class="plain" id="codemap"><thead><tr><th>Function</th><th>What it does</th><th>Module</th></tr></thead><tbody>${rows}</tbody></table></div>`;
  };

  const sectionsHtml = h.doc.sections
    .filter((s) => !s.name.toLowerCase().startsWith("change log"))
    .map((s) => {
      const id = anchor(s.name);
      const body = s.name.toLowerCase().startsWith("code map")
        ? codeMap(s)
        : `<div class="prose">${blocks(s.blocks)}</div>${s.entries.length ? `<div class="entries">${s.entries.map((en) => entry(en, id)).join("\n")}</div>` : ""}`;
      return `<section id="${id}"><h2>${esc(s.name)}</h2>\n${body}\n</section>`;
    })
    .join("\n\n");

  const toc = [...h.doc.sections.filter((s) => !s.name.toLowerCase().startsWith("change log")).map((s) => [anchor(s.name), s.name]), ["log", "Change log"]]
    .map(([id, name]) => `<li><a href="#${id}">${esc(name)}</a></li>`)
    .join("");
  const fnCount = report.coverage.reduce((n, c) => n + c.functions.length, 0);
  const stat = (n: number | string, label: string) => `<div class="stat"><span class="n">${n}</span><span class="l">${label}</span></div>`;
  const calcCount = h.entries.length;

  return `<title>How RetireWise Works</title>
${FONTS}
<style>${BASE_CSS}${DOC_CSS}${HOW_CSS}</style>
<div class="page">
<header class="hero">
  <p class="eyebrow">RetireWise · How it works</p>
  <h1>How RetireWise works</h1>
  <p class="meta">${r.preview ? `<b>Preview, not released.</b> Built from ${commit(r.sha)}` : `As live in production at ${commit(r.sha)}`} · ${esc(r.date)} · last reviewed ${esc(h.doc.lastReviewed)}</p>
  ${renderBlocks(h.doc.intro, inline, "lede")}
  <div class="stats">${stat(calcCount, "calculations explained")}${stat(fnCount, "functions mapped")}${stat(values["mc.simulations"], "simulated markets a run")}${stat(values["scenario.count"], "market scenarios")}${stat(`${(engineJs.length / 1024).toFixed(0)}<small> KB</small>`, "of production code on this page")}</div>
  <div class="release" role="status"><p class="eyebrow">This release</p>${
    r.firstPublication
      ? `<p class="note">First publication of this document.</p>`
      : r.changes.length
        ? `<ul class="changes">${r.changes.map((x) => `<li>${inline(x)}</li>`).join("")}</ul>`
        : `<p class="note">No calculation changed since ${r.previousSha ? commit(r.previousSha) : "the last release"}.</p>`
  }</div>
  ${report.errors.length ? `<div class="problems" role="alert"><p><b>${report.errors.length} problem${report.errors.length === 1 ? "" : "s"} between the document and the code at this commit.</b> <code>pnpm how:check</code> names them.</p><ul>${report.errors.slice(0, 8).map((x) => `<li>${inline(x)}</li>`).join("")}</ul></div>` : ""}
  <p class="source">Written in ${fileAt(DOC_FILE)}. Every figure in the text, the tables of assumptions and the calculators come from the code at ${commit(r.sha)}: the calculators run the same engine as the app.</p>
</header>
<div class="layout">
<nav class="toc" aria-label="Contents"><p class="eyebrow">Contents</p><ol>${toc}</ol></nav>
<main>
${sectionsHtml}

<section id="log"><h2>Change log</h2>
<div class="scroll"><table class="plain"><thead><tr><th scope="col">Date</th><th scope="col">Change</th><th scope="col">By</th></tr></thead>
<tbody>${[...h.log].reverse().map((l) => `<tr><td class="id">${esc(l.date)}</td><td>${inline(l.change)}</td><td class="src">${esc(l.by)}</td></tr>`).join("\n")}</tbody></table></div>
</section>
</main>
</div>
<p class="foot">${r.preview ? "A preview for review. The published page is built only after a successful <code>pnpm deploy:prod</code>, so it describes what is live." : "Published after a successful <code>pnpm deploy:prod</code>, so this page describes what is live."} Built by <code>scripts/build-how-it-works.ts</code>, which also fails CI when the document and the code disagree: <code>pnpm how:check</code>.</p>
</div>
<div class="tip" id="tip" role="status" hidden></div>
<script>${engineJs.replace(/<\/script/gi, "<\\/script")}</script>
<script>${JS}</script>
`;
}


const HOW_CSS = `
:root { --s1: #2a78d6; --s2: #eb6834; --s3: #1baf7a; --s4: #4a3aa7; --grid: #E3E8E6; --axis: #9AA8A2; }
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { --s1: #3987e5; --s2: #d95926; --s3: #199e70; --s4: #9085e9; --grid: #26302D; --axis: #4F5D58; } }
:root[data-theme="dark"] { --s1: #3987e5; --s2: #d95926; --s3: #199e70; --s4: #9085e9; --grid: #26302D; --axis: #4F5D58; }
.formula { margin: 0; background: var(--panel); border: 1px solid var(--line); border-left: 3px solid var(--accent); border-radius: 6px; padding: 12px 16px; overflow-x: auto; font: 500 0.88rem/1.7 var(--mono); color: var(--ink); max-width: 86ch; }
.formula code { background: transparent; padding: 0; font-size: inherit; white-space: pre; }
.play { display: grid; grid-template-columns: 290px minmax(0, 1fr); gap: 20px; align-items: start; background: var(--panel); border: 1px solid var(--line); border-radius: 10px; padding: 16px; }
.controls { display: grid; gap: 12px; position: sticky; top: calc(env(safe-area-inset-top, 0px) + 12px); max-height: calc(100vh - 24px); overflow-y: auto; padding-right: 4px; }
.controls fieldset { border: 0; border-top: 1px solid var(--line); margin: 0; padding: 10px 0 0; display: grid; grid-template-columns: 1fr 1fr; gap: 8px 10px; }
.controls legend { font: 500 0.7rem/1 var(--mono); letter-spacing: 0.08em; text-transform: uppercase; color: var(--muted); padding: 0 6px 0 0; }
.fld { display: grid; gap: 3px; font-size: 0.8rem; color: var(--muted); min-width: 0; }
.fld input, .fld select { font: inherit; font-size: 0.95rem; color: var(--ink); background: var(--paper); border: 1px solid var(--line-strong); border-radius: 6px; padding: 6px 8px; width: 100%; min-width: 0; font-variant-numeric: tabular-nums; }
.fld input[type="range"] { padding: 0; accent-color: var(--accent); background: transparent; border: 0; }
.fld.wide { grid-column: 1 / -1; }
.chk { grid-column: 1 / -1; display: flex; gap: 8px; align-items: center; font-size: 0.85rem; color: var(--ink); }
.chk input { accent-color: var(--accent); width: 16px; height: 16px; }
.btn { font: inherit; font-size: 0.9rem; padding: 8px 12px; border-radius: 6px; border: 1px solid var(--line-strong); background: var(--paper); color: var(--ink); cursor: pointer; }
.btn:hover { border-color: var(--accent); color: var(--accent); }
.results { display: grid; gap: 16px; min-width: 0; }
.example-flag { font-size: 0.85rem; color: var(--muted); margin: 0; }
.tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 10px; }
.tile { background: var(--paper); border: 1px solid var(--line); border-radius: 8px; padding: 10px 14px; display: grid; gap: 2px; align-content: start; }
.tile .l { font-size: 0.8rem; color: var(--muted); }
.tile .v { font: 700 1.45rem/1.15 var(--body); }
.tile.hero .v { font-size: 2.4rem; color: var(--accent); }
.tile .d { font-size: 0.78rem; color: var(--muted); }
.chart { margin: 0; display: grid; gap: 6px; min-width: 0; }
.chart figcaption { display: grid; gap: 2px; font-size: 0.95rem; }
.legend { display: flex; flex-wrap: wrap; gap: 4px 14px; font-size: 0.8rem; color: var(--muted); }
.legend span { display: inline-flex; align-items: center; gap: 6px; }
.legend i { display: inline-block; width: 14px; height: 10px; border-radius: 2px; }
.legend i.line { height: 2px; border-radius: 1px; }
.plot { position: relative; min-width: 0; }
.plot svg { display: block; width: 100%; height: auto; overflow: visible; }
.plot .ax { font: 400 11px var(--mono); fill: var(--muted); }
.plot .lbl { font: 600 12px var(--body); fill: var(--ink); }
.plot .grid { stroke: var(--grid); stroke-width: 1; }
.plot .base { stroke: var(--axis); stroke-width: 1; }
.plot .cross { stroke: var(--muted); stroke-width: 1; }
.tip { position: fixed; z-index: 10; pointer-events: none; background: var(--panel); color: var(--ink); border: 1px solid var(--line-strong); border-radius: 6px; padding: 8px 10px; font-size: 0.8rem; box-shadow: 0 4px 16px rgba(0,0,0,0.12); max-width: 340px; }
.tip .tt { font-weight: 700; margin-bottom: 4px; }
.tip .tr { display: grid; grid-template-columns: 12px auto 1fr; gap: 6px; align-items: center; }
.tip .tr b { font-variant-numeric: tabular-nums; }
.tip .tk { height: 2px; border-radius: 1px; }
.tip .tn { color: var(--muted); }
.widget { background: var(--panel); border: 1px solid var(--line); border-radius: 10px; padding: 14px 16px; display: grid; gap: 12px; max-width: 92ch; }
.wrow { display: flex; flex-wrap: wrap; gap: 10px 14px; align-items: end; }
.wrow .fld { flex: 1 1 150px; }
.wrow .fld.grow { flex: 2 1 240px; }
.readout { margin: 0; font-size: 1rem; }
.readout b { font-variant-numeric: tabular-nums; }
table.ledger td:last-child, table.ledger th:last-child, td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
table.ledger tr.sum td { font-weight: 700; border-top: 1px solid var(--line-strong); }
table.ledger td.how { color: var(--muted); font-size: 0.84rem; }
table.mini td, table.mini th { padding: 6px 7px; }
.assume { display: grid; gap: 10px; }
.assume h3 { padding-top: 8px; }
details.yt summary { font-weight: 500; color: var(--ink); }
#pg-table td, #pg-table th { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
#pg-table td:first-child, #pg-table th:first-child { text-align: left; }
#pg-table tr.ret td:first-child::after { content: " ·"; color: var(--accent); }
@media (max-width: 900px) {
  .play { grid-template-columns: minmax(0, 1fr); }
  .controls { position: static; max-height: none; overflow: visible; }
}
@media (max-width: 560px) {
  .play { padding: 12px; }
  .controls fieldset { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); }
  .tile.hero .v { font-size: 2rem; }
}
`;

const JS = String.raw`
(function () {
  var E = window.RetireWiseEngine;
  if (!E) return;
  var $ = function (id) { return document.getElementById(id); };
  var money = function (n) { return (n < 0 ? "-$" : "$") + Math.abs(Math.round(n)).toLocaleString("en-US"); };
  var compact = function (n) {
    var a = Math.abs(n);
    if (a >= 1e6) return "$" + (n / 1e6).toFixed(a >= 1e7 ? 0 : 1).replace(/\.0$/, "") + "M";
    if (a >= 1e3) return "$" + Math.round(n / 1e3) + "K";
    return "$" + Math.round(n);
  };
  var pct = function (n, d) { return (Math.round(n * Math.pow(10, d || 0)) / Math.pow(10, d || 0)) + "%"; };
  var NS = "http://www.w3.org/2000/svg";
  var tip = $("tip");
  function showTip(evt, title, rows) {
    tip.textContent = "";
    var t = document.createElement("div"); t.className = "tt"; t.textContent = title; tip.appendChild(t);
    rows.forEach(function (r) {
      var row = document.createElement("div"); row.className = "tr";
      var k = document.createElement("span"); k.className = "tk"; k.style.background = r.color || "transparent";
      var b = document.createElement("b"); b.textContent = r.value;
      var n = document.createElement("span"); n.className = "tn"; n.textContent = r.label;
      row.appendChild(k); row.appendChild(b); row.appendChild(n); tip.appendChild(row);
    });
    tip.hidden = false;
    var x = evt.clientX + 14, y = evt.clientY + 14;
    var w = tip.offsetWidth, h = tip.offsetHeight;
    if (x + w > window.innerWidth - 8) x = evt.clientX - w - 14;
    if (y + h > window.innerHeight - 8) y = evt.clientY - h - 14;
    tip.style.left = Math.max(8, x) + "px"; tip.style.top = Math.max(8, y) + "px";
  }
  function hideTip() { tip.hidden = true; }
  function css(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }
  function niceMax(v) {
    if (v <= 0) return 1;
    var p = Math.pow(10, Math.floor(Math.log10(v)));
    var steps = [1, 2, 2.5, 5, 10];
    for (var i = 0; i < steps.length; i++) if (steps[i] * p >= v) return steps[i] * p;
    return 10 * p;
  }
  function frame(width, height, pad) { return { w: width, h: height, l: pad[3], r: pad[1], t: pad[0], b: pad[2], iw: width - pad[1] - pad[3], ih: height - pad[0] - pad[2] }; }
  // Charts are drawn at the width they occupy, so text is its real size at any width.
  function widthOf(node, fallback) { return Math.max(300, Math.round(node.clientWidth || fallback)); }
  function el(tag, attrs, parent) { var e = document.createElementNS(NS, tag); for (var k in attrs) e.setAttribute(k, attrs[k]); if (parent) parent.appendChild(e); return e; }
  function legend(node, items) {
    node.textContent = "";
    items.forEach(function (it) {
      var s = document.createElement("span"); var i = document.createElement("i");
      i.style.background = it.color; if (it.line) i.className = "line"; if (it.opacity) i.style.opacity = it.opacity;
      s.appendChild(i); s.appendChild(document.createTextNode(it.label)); node.appendChild(s);
    });
  }
  function yAxis(svg, f, max, fmt) {
    for (var i = 0; i <= 4; i++) {
      var v = (max / 4) * i, y = f.t + f.ih - (v / max) * f.ih;
      el("line", { x1: f.l, x2: f.l + f.iw, y1: y, y2: y, class: i === 0 ? "base" : "grid" }, svg);
      var tx = el("text", { x: f.l - 6, y: y + 4, "text-anchor": "end", class: "ax" }, svg); tx.textContent = fmt(v);
    }
  }

  // ---- the playground ---------------------------------------------------
  var FIELDS = ["age", "retirementAge", "salary", "salaryGrowthPct", "partnerAge", "pretaxBalance", "deferralPct", "matchUpToPct", "rothBalance", "rothAnnual", "taxableBalance", "monthlySpending", "selfSSAtFRA", "partnerSSAtFRA", "claimAgeSelf", "claimAgePartner", "retirementYears", "withdrawalRatePct"];
  var state = JSON.parse(JSON.stringify(E.EXAMPLE_INPUTS));
  var run = null;
  function writeForm() {
    FIELDS.forEach(function (k) { var i = $("pg-" + k); if (i) i.value = state[k] === null ? "" : state[k]; });
    $("pg-matchRatePct").value = Math.round(state.matchRate * 100);
    $("pg-hasPartner").checked = state.partnerAge !== null;
    if (state.partnerAge === null) $("pg-partnerAge").value = "";
    $("pg-scenarioId").value = state.scenarioId;
    $("pg-withdrawalMethod").value = state.withdrawalMethod;
    $("pg-glidePath").checked = state.glidePath;
    $("pg-catchUp").checked = state.catchUp;
    syncDisabled();
  }
  function syncDisabled() {
    var partner = $("pg-hasPartner").checked;
    ["pg-partnerAge", "pg-partnerSSAtFRA", "pg-claimAgePartner"].forEach(function (id) { $(id).disabled = !partner; });
    $("pg-withdrawalRatePct").disabled = $("pg-withdrawalMethod").value === "expense";
  }
  function readForm() {
    var n = function (id, fallback) { var v = parseFloat($(id).value); return isFinite(v) ? v : fallback; };
    FIELDS.forEach(function (k) { if (k !== "partnerAge") state[k] = n("pg-" + k, state[k]); });
    state.matchRate = n("pg-matchRatePct", state.matchRate * 100) / 100;
    state.partnerAge = $("pg-hasPartner").checked ? n("pg-partnerAge", state.age) : null;
    state.scenarioId = $("pg-scenarioId").value;
    state.withdrawalMethod = $("pg-withdrawalMethod").value;
    state.glidePath = $("pg-glidePath").checked;
    state.catchUp = $("pg-catchUp").checked;
    if (state.retirementAge < state.age) state.retirementAge = state.age;
    state.claimAgeSelf = Math.min(70, Math.max(62, Math.round(state.claimAgeSelf)));
    state.claimAgePartner = Math.min(70, Math.max(62, Math.round(state.claimAgePartner)));
  }
  function fan() {
    var node = $("pg-fan").querySelector(".plot"); node.textContent = "";
    var p = run.projection, d = run.odds.chartData;
    var W = widthOf(node, 720), f = frame(W, 300, [14, 64, 26, 52]);
    var max = niceMax(Math.max.apply(null, d.map(function (x) { return x.p90; }).concat(p.totalValues)));
    var svg = el("svg", { viewBox: "0 0 " + W + " 300", role: "img", "aria-label": "Savings by age: the steady-market projection and the range of simulated markets." }, node);
    yAxis(svg, f, max, compact);
    var n = d.length, x = function (i) { return f.l + (n <= 1 ? 0 : (i / (n - 1)) * f.iw); }, y = function (v) { return f.t + f.ih - (Math.max(0, v) / max) * f.ih; };
    function band(lo, hi, op) {
      var top = d.map(function (r, i) { return x(i) + "," + y(r[hi]); }).join(" ");
      var bot = d.map(function (r, i) { return x(i) + "," + y(r[lo]); }).reverse().join(" ");
      el("polygon", { points: top + " " + bot, fill: css("--s1"), opacity: op }, svg);
    }
    band("p10", "p90", 0.1); band("p25", "p75", 0.18);
    var line = function (vals, color) { el("polyline", { points: vals.map(function (v, i) { return x(i) + "," + y(v); }).join(" "), fill: "none", stroke: color, "stroke-width": 2, "stroke-linejoin": "round", "stroke-linecap": "round" }, svg); };
    line(d.map(function (r) { return r.p50; }), css("--s1"));
    line(p.totalValues, css("--s2"));
    var ry = run.inputs.yearsToRetirement - 1;
    if (ry >= 0 && ry < n) {
      el("line", { x1: x(ry), x2: x(ry), y1: f.t, y2: f.t + f.ih, class: "grid" }, svg);
      var rt = el("text", { x: x(ry) + 4, y: f.t + 10, class: "ax" }, svg); rt.textContent = "Retires at " + p.ages[ry];
    }
    for (var i = 0; i < n; i += Math.max(1, Math.round(n / Math.max(4, Math.floor(f.iw / 70))))) { var t = el("text", { x: x(i), y: f.t + f.ih + 16, "text-anchor": "middle", class: "ax" }, svg); t.textContent = p.ages[i]; }
    var last = n - 1;
    var l1 = el("text", { x: x(last) + 6, y: y(d[last].p50) + 4, class: "lbl" }, svg); l1.textContent = "Middle";
    var l2 = el("text", { x: x(last) + 6, y: y(p.totalValues[last]) + (Math.abs(y(p.totalValues[last]) - y(d[last].p50)) < 14 ? 16 : 4), class: "lbl" }, svg); l2.textContent = "Steady";
    var cross = el("line", { x1: 0, x2: 0, y1: f.t, y2: f.t + f.ih, class: "cross", visibility: "hidden" }, svg);
    var hit = el("rect", { x: f.l, y: f.t, width: f.iw, height: f.ih, fill: "transparent" }, svg);
    hit.addEventListener("pointermove", function (evt) {
      var box = svg.getBoundingClientRect(); var sx = (evt.clientX - box.left) * (W / box.width);
      var i = Math.max(0, Math.min(n - 1, Math.round(((sx - f.l) / f.iw) * (n - 1))));
      cross.setAttribute("x1", x(i)); cross.setAttribute("x2", x(i)); cross.setAttribute("visibility", "visible");
      var r = d[i];
      showTip(evt, "Age " + p.ages[i] + (p.phases[i] === "retirement" ? ", retired" : ""), [
        { color: css("--s2"), value: money(p.totalValues[i]), label: "steady market" },
        { color: css("--s1"), value: money(r.p50), label: "middle of " + run.odds.simulations + " markets" },
        { value: money(r.p25) + " – " + money(r.p75), label: "middle half" },
        { value: money(r.p10) + " – " + money(r.p90), label: "middle 80%" }
      ]);
    });
    hit.addEventListener("pointerleave", function () { cross.setAttribute("visibility", "hidden"); hideTip(); });
    legend($("pg-fan-legend"), [
      { color: css("--s2"), label: "Steady market (the scenario's average every year)", line: true },
      { color: css("--s1"), label: "Middle simulated market", line: true },
      { color: css("--s1"), label: "Middle 50% and 80% of markets", opacity: 0.3 }
    ]);
  }
  function flows() {
    var node = $("pg-flows").querySelector(".plot"); node.textContent = "";
    var p = run.projection, idx = [];
    for (var i = 0; i < p.years.length; i++) if (p.phases[i] === "retirement") idx.push(i);
    if (!idx.length) { node.textContent = "No retirement years in this horizon."; return; }
    var series = [
      { key: "ss", label: "Social Security", color: css("--s1"), v: function (i) { return run.ssNominal[i]; } },
      { key: "spent", label: "From savings, spent", color: css("--s3"), v: function (i) { return Math.max(0, p.withdrawals[i] - p.taxes[i] - p.reinvested[i]); } },
      { key: "tax", label: "Federal tax on withdrawals", color: css("--s2"), v: function (i) { return p.taxes[i]; } },
      { key: "re", label: "Required distribution reinvested", color: css("--s4"), v: function (i) { return p.reinvested[i]; } }
    ];
    var totals = idx.map(function (i) { return series.reduce(function (s, se) { return s + se.v(i); }, 0); });
    var W = widthOf(node, 720), f = frame(W, 280, [14, 16, 26, 52]);
    var max = niceMax(Math.max.apply(null, totals.concat([1])));
    var svg = el("svg", { viewBox: "0 0 " + W + " 280", role: "img", "aria-label": "Each retirement year: Social Security, savings spent, tax and reinvested distributions, stacked." }, node);
    yAxis(svg, f, max, compact);
    var slot = f.iw / idx.length, bw = Math.min(24, slot - 2);
    idx.forEach(function (i, k) {
      var cx = f.l + slot * k + slot / 2, acc = 0;
      var g = el("g", {}, svg);
      series.forEach(function (se, si) {
        var v = se.v(i); if (v <= 0) return;
        var y0 = f.t + f.ih - (acc / max) * f.ih, y1 = f.t + f.ih - ((acc + v) / max) * f.ih;
        var top = si === series.length - 1 || series.slice(si + 1).every(function (s2) { return s2.v(i) <= 0; });
        el("rect", { x: cx - bw / 2, y: y1, width: bw, height: Math.max(0, y0 - y1 - (acc > 0 ? 2 : 0)), rx: top ? 3 : 0, fill: se.color }, g);
        acc += v;
      });
      var hit = el("rect", { x: f.l + slot * k, y: f.t, width: slot, height: f.ih, fill: "transparent", tabindex: 0 }, svg);
      var show = function (evt) {
        showTip(evt, "Age " + p.ages[i] + ": spending " + money(run.spendingNominal[i]), series.map(function (se) { return { color: se.color, value: money(se.v(i)), label: se.label }; }).concat(p.rmdAmounts[i] ? [{ value: money(p.rmdAmounts[i]), label: "required distribution" }] : []));
        g.style.opacity = 0.75;
      };
      hit.addEventListener("pointermove", show);
      hit.addEventListener("focus", function () { var b = hit.getBoundingClientRect(); show({ clientX: b.left + b.width / 2, clientY: b.top + 20 }); });
      hit.addEventListener("pointerleave", function () { g.style.opacity = 1; hideTip(); });
      hit.addEventListener("blur", function () { g.style.opacity = 1; hideTip(); });
      if (k % Math.max(1, Math.round(idx.length / Math.max(4, Math.floor(f.iw / 60)))) === 0) { var t = el("text", { x: cx, y: f.t + f.ih + 16, "text-anchor": "middle", class: "ax" }, svg); t.textContent = p.ages[i]; }
    });
    legend($("pg-flows-legend"), series.map(function (se) { return { color: se.color, label: se.label }; }));
  }
  function table() {
    var p = run.projection, t = $("pg-table");
    var head = "<thead><tr><th>Age</th><th>Contributions</th><th>Social Security</th><th>Withdrawn</th><th>Tax</th><th>Required distribution</th><th>Reinvested</th><th>Savings at year end</th></tr></thead>";
    var rows = p.years.map(function (y) {
      return "<tr class=\"" + (p.phases[y] === "retirement" ? "ret" : "") + "\"><td>" + p.ages[y] + "</td><td>" + money(p.contributions[y]) + "</td><td>" + money(run.ssNominal[y]) + "</td><td>" + money(p.withdrawals[y]) + "</td><td>" + money(p.taxes[y]) + "</td><td>" + money(p.rmdAmounts[y]) + "</td><td>" + money(p.reinvested[y]) + "</td><td>" + money(p.totalValues[y]) + "</td></tr>";
    }).join("");
    t.innerHTML = head + "<tbody>" + rows + "</tbody>";
  }
  function tiles() {
    var o = run.odds, p = run.projection;
    $("pg-odds").textContent = o.successRate + "%";
    $("pg-odds-sub").textContent = "of " + o.simulations + " simulated markets, to age " + p.ages[p.ages.length - 1];
    $("pg-atret").textContent = compact(run.balanceAtRetirement);
    $("pg-median").textContent = compact(o.medianAtRetirement);
    $("pg-range").textContent = "80% of markets: " + compact(o.worstCase) + " – " + compact(o.bestCase);
    $("pg-lasts").textContent = run.depletionAge === null ? "Lasts" : "Runs out at " + run.depletionAge;
    $("pg-lasts-sub").textContent = run.depletionAge === null ? money(p.totalValues[p.totalValues.length - 1]) + " left at " + p.ages[p.ages.length - 1] : "every year's average return";
  }
  function recompute() {
    run = E.simulate(state);
    tiles(); fan(); flows(); table(); yearWidget(); scenarios();
    var changed = JSON.stringify(state) !== JSON.stringify(E.EXAMPLE_INPUTS);
    $("pg-flag").textContent = changed ? "Your figures, in this page only: nothing is saved or sent anywhere. The production engine recalculated." : "An example household, not anyone's real figures. Change anything; the production engine recalculates.";
  }
  var timer = null;
  function onInput() { syncDisabled(); clearTimeout(timer); timer = setTimeout(function () { readForm(); recompute(); }, 120); }
  if ($("pg-form")) {
    $("pg-form").addEventListener("input", onInput);
    $("pg-form").addEventListener("change", onInput);
    $("pg-reset").addEventListener("click", function () { state = JSON.parse(JSON.stringify(E.EXAMPLE_INPUTS)); writeForm(); recompute(); });
    writeForm();
  }

  // ---- one year, taken apart ----------------------------------------------
  function yearWidget() {
    var s = $("yr-age"); if (!s || !run) return;
    var n = run.projection.years.length;
    s.max = String(n - 1);
    if (!s.dataset.touched) s.value = String(Math.min(n - 1, run.inputs.yearsToRetirement + 8));
    var l = E.explainYear(run, Number(s.value));
    $("yr-age-out").textContent = String(l.age);
    var rows = [["Savings at the start of the year", "", money(l.start)], ["Market growth", "start × " + pct(l.ratePct, 2) + (run.inputs.params.glidePath ? " (glide path at this age)" : ""), money(l.growth)]];
    if (!l.retired) rows.push(["Contributions, yours and your employer's", "capped by the IRS limit on your own deferral", money(l.contributions)]);
    else {
      rows.push(["Spending, in this year's dollars", "today's spending × " + l.priceLevel.toFixed(3) + " (inflation since today)", money(l.spending)]);
      rows.push(["Social Security, in this year's dollars", l.ss ? "today's benefit × the same factor" : "not claimed yet", money(l.ss)]);
      rows.push(["Needed from savings, after tax", "spending − Social Security", money(l.need)]);
      if (l.rmd) rows.push(["Required minimum distribution", money(l.taxDeferredBalance) + " tax-deferred ÷ divisor at " + l.age, money(l.rmd)]);
      rows.push(["Withdrawn, gross", l.rmd > l.need + l.tax ? "the required distribution, which is more than spending needs" : "enough to leave the need after its own tax", "− " + money(l.withdrawal)]);
      rows.push(["of which federal tax", "on the tax-deferred part, with Social Security's taxable share", money(l.tax)]);
      if (l.reinvested) rows.push(["Reinvested in a taxable account", "what a forced distribution leaves after tax and spending", "+ " + money(l.reinvested)]);
    }
    rows.push(["Savings at the end of the year", "", money(l.end)]);
    $("yr-ledger").innerHTML = "<tbody>" + rows.map(function (r, i) { return "<tr" + (i === rows.length - 1 ? " class=\"sum\"" : "") + "><td>" + r[0] + "</td><td class=\"how\">" + r[1] + "</td><td>" + r[2] + "</td></tr>"; }).join("") + "</tbody>";
    $("yr-note").textContent = "Every figure is a column of the engine's own result for this year; market growth is the difference that makes the year balance, and it equals the start balance times the year's return.";
  }
  if ($("yr-age")) $("yr-age").addEventListener("input", function (e) { e.target.dataset.touched = "1"; yearWidget(); });

  // ---- Social Security by claiming age -------------------------------------
  function ss() {
    var b = parseFloat($("ss-benefit").value) || 0, fra = parseFloat($("ss-fra").value) || 67, age = Number($("ss-age").value);
    $("ss-age-out").textContent = String(age);
    var v = E.adjustSSBenefit(b, fra, age);
    $("ss-out").innerHTML = "Claiming at " + age + " pays <b>" + money(v) + "</b> a month, <b>" + pct((v / (b || 1)) * 100, 1) + "</b> of the full benefit.";
    var node = $("ss-plot"); node.textContent = "";
    var ages = [62, 63, 64, 65, 66, 67, 68, 69, 70], vals = ages.map(function (a) { return E.adjustSSBenefit(b, fra, a); });
    var W = widthOf(node, 640), f = frame(W, 200, [18, 10, 24, 52]), max = niceMax(Math.max.apply(null, vals.concat([1])));
    var svg = el("svg", { viewBox: "0 0 " + W + " 200", role: "img", "aria-label": "Monthly benefit at each claiming age from 62 to 70." }, node);
    yAxis(svg, f, max, compact);
    var slot = f.iw / ages.length, bw = Math.min(24, slot - 2);
    ages.forEach(function (a, i) {
      var cx = f.l + slot * i + slot / 2, y1 = f.t + f.ih - (vals[i] / max) * f.ih;
      el("rect", { x: cx - bw / 2, y: y1, width: bw, height: f.t + f.ih - y1, rx: 3, fill: css("--s1"), opacity: a === age ? 1 : 0.35 }, svg);
      var t = el("text", { x: cx, y: f.t + f.ih + 16, "text-anchor": "middle", class: "ax" }, svg); t.textContent = a;
      if (a === age) { var l = el("text", { x: cx, y: y1 - 6, "text-anchor": "middle", class: "lbl" }, svg); l.textContent = compact(vals[i]); }
    });
  }
  if ($("w-ss")) {
    $("ss-benefit").value = E.EXAMPLE_INPUTS.selfSSAtFRA; $("ss-fra").value = 67; $("ss-age").value = 67;
    $("w-ss").addEventListener("input", ss); ss();
  }

  // ---- tax on a retirement year ---------------------------------------------
  function tax() {
    var o = parseFloat($("tx-ordinary").value) || 0, s = parseFloat($("tx-ss").value) || 0, yrs = parseFloat($("tx-years").value) || 0, inf = parseFloat($("tx-inflation").value) || 0;
    var level = Math.pow(1 + inf / 100, yrs);
    var taxableSS = E.taxableSocialSecurity(s, o);
    var income = o + taxableSS;
    var t = E.projectedIncomeTax(o, s, level);
    var ded = E.DEFAULT_TAX_TABLE.standardDeduction * level;
    var marginal = E.getMarginalRate(income / level) * 100;
    var rows = [
      ["Provisional income", "other income + half of Social Security", money(o + s / 2)],
      ["Taxable Social Security", "0%, up to 50%, up to 85% of benefits as provisional income passes " + money(32000) + " and " + money(44000), money(taxableSS)],
      ["Income for tax", "tax-deferred withdrawals + taxable Social Security", money(income)],
      ["Standard deduction, inflated", money(E.DEFAULT_TAX_TABLE.standardDeduction) + " × " + level.toFixed(3), money(ded)],
      ["Federal tax", "today's brackets on the income deflated to today, then inflated back", money(t)],
      ["Effective rate on income for tax", "", income > 0 ? pct((t / income) * 100, 1) : "0%"],
      ["Marginal rate", "the bracket the next dollar lands in", pct(marginal, 0)]
    ];
    $("tx-ledger").innerHTML = "<tbody>" + rows.map(function (r, i) { return "<tr" + (i === 4 ? " class=\"sum\"" : "") + "><td>" + r[0] + "</td><td class=\"how\">" + r[1] + "</td><td>" + r[2] + "</td></tr>"; }).join("") + "</tbody>";
  }
  if ($("w-tax")) {
    $("tx-ordinary").value = 80000; $("tx-ss").value = 60000; $("tx-years").value = 0; $("tx-inflation").value = 3;
    $("w-tax").addEventListener("input", tax); tax();
  }

  // ---- required distributions ---------------------------------------------
  function rmd() {
    var b = parseFloat($("rmd-balance").value) || 0, a = Math.round(parseFloat($("rmd-age").value) || 0);
    var v = E.calculateRMD(b, a);
    $("rmd-out").innerHTML = v > 0
      ? "At " + a + " the divisor is <b>" + (b / v).toFixed(1) + "</b>, so at least <b>" + money(v) + "</b> must come out this year, " + pct((v / b) * 100, 1) + " of the balance."
      : "Nothing is required before " + E.RMD_START_AGE + ".";
  }
  if ($("w-rmd")) { $("rmd-balance").value = 1000000; $("rmd-age").value = 75; $("w-rmd").addEventListener("input", rmd); rmd(); }

  // ---- glide path -----------------------------------------------------------
  function glide() {
    var cfg = { enabled: true, startProfile: $("gp-start").value, endProfile: $("gp-end").value, transitionStartAge: Number($("gp-from").value), transitionEndAge: Number($("gp-to").value), curve: $("gp-curve").value };
    if (cfg.transitionEndAge <= cfg.transitionStartAge) cfg.transitionEndAge = cfg.transitionStartAge + 1;
    var ages = []; for (var a = 30; a <= 95; a++) ages.push(a);
    var pts = ages.map(function (a) { return E.getGlidePathParams(a, cfg); });
    var at = E.getGlidePathParams(cfg.transitionEndAge, cfg), from = E.getGlidePathParams(cfg.transitionStartAge, cfg);
    $("gp-out").innerHTML = "Until " + cfg.transitionStartAge + ": <b>" + pct(from.stockPct) + "</b> stocks, expecting " + pct(from.returnPct, 1) + " a year at " + pct(from.volatility, 1) + " volatility. From " + cfg.transitionEndAge + ": <b>" + pct(at.stockPct) + "</b> stocks, " + pct(at.returnPct, 1) + " at " + pct(at.volatility, 1) + ".";
    var node = $("gp-plot"); node.textContent = "";
    var W = widthOf(node, 640), f = frame(W, 200, [14, 16, 24, 44]);
    var svg = el("svg", { viewBox: "0 0 " + W + " 200", role: "img", "aria-label": "Share in stocks by age along the glide path." }, node);
    yAxis(svg, f, 100, function (v) { return v + "%"; });
    var x = function (i) { return f.l + (i / (ages.length - 1)) * f.iw; }, y = function (v) { return f.t + f.ih - (v / 100) * f.ih; };
    el("polyline", { points: pts.map(function (p, i) { return x(i) + "," + y(p.stockPct); }).join(" "), fill: "none", stroke: css("--s1"), "stroke-width": 2, "stroke-linejoin": "round" }, svg);
    for (var i = 0; i < ages.length; i += 10) { var t = el("text", { x: x(i), y: f.t + f.ih + 16, "text-anchor": "middle", class: "ax" }, svg); t.textContent = ages[i]; }
    var hit = el("rect", { x: f.l, y: f.t, width: f.iw, height: f.ih, fill: "transparent" }, svg);
    hit.addEventListener("pointermove", function (evt) {
      var box = svg.getBoundingClientRect(); var sx = (evt.clientX - box.left) * (W / box.width);
      var i = Math.max(0, Math.min(ages.length - 1, Math.round(((sx - f.l) / f.iw) * (ages.length - 1))));
      showTip(evt, "Age " + ages[i], [{ color: css("--s1"), value: pct(pts[i].stockPct, 1), label: "in stocks" }, { value: pct(pts[i].returnPct, 2), label: "expected return" }, { value: pct(pts[i].volatility, 2), label: "volatility" }]);
    });
    hit.addEventListener("pointerleave", hideTip);
  }
  if ($("w-glide")) {
    var g = E.getDefaultGlidePathConfig(E.EXAMPLE_INPUTS.age, E.EXAMPLE_INPUTS.retirementAge, "moderate");
    $("gp-start").value = g.startProfile; $("gp-end").value = g.endProfile; $("gp-from").value = g.transitionStartAge; $("gp-to").value = g.transitionEndAge; $("gp-curve").value = g.curve;
    $("w-glide").addEventListener("input", glide); $("w-glide").addEventListener("change", glide); glide();
  }

  // ---- the odds under every scenario ----------------------------------------
  var scenarioTimer = null;
  function scenarios() {
    if (!$("mc-plot") || !run) return;
    clearTimeout(scenarioTimer);
    scenarioTimer = setTimeout(function () {
      var rows = E.MARKET_SCENARIOS.map(function (s) {
        var r = E.simulate(Object.assign({}, state, { scenarioId: s.id }));
        return { name: s.name, odds: r.odds.successRate, current: s.id === state.scenarioId };
      });
      var node = $("mc-plot"); node.textContent = "";
      var rowH = 30, W = widthOf(node, 640), f = frame(W, rows.length * rowH + 16, [8, 48, 8, 140]);
      var svg = el("svg", { viewBox: "0 0 " + W + " " + f.h, role: "img", "aria-label": "Share of simulated markets in which savings last, by market scenario." }, node);
      rows.forEach(function (r, i) {
        var y0 = f.t + i * rowH, w = (r.odds / 100) * f.iw;
        var name = el("text", { x: f.l - 8, y: y0 + rowH / 2 + 4, "text-anchor": "end", class: r.current ? "lbl" : "ax" }, svg); name.textContent = r.name;
        el("line", { x1: f.l, x2: f.l, y1: y0 + 4, y2: y0 + rowH - 4, class: "base" }, svg);
        if (w > 0) el("rect", { x: f.l, y: y0 + rowH / 2 - 9, width: w, height: 18, rx: 3, fill: css("--s1"), opacity: r.current ? 1 : 0.45 }, svg);
        var v = el("text", { x: f.l + w + 6, y: y0 + rowH / 2 + 4, class: "lbl" }, svg); v.textContent = r.odds + "%";
      });
    }, 250);
  }

  var lastWidth = window.innerWidth, resizeTimer = null;
  window.addEventListener("resize", function () {
    if (window.innerWidth === lastWidth) return;
    lastWidth = window.innerWidth; clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () { if (run && $("pg-fan")) { fan(); flows(); } if ($("w-ss")) ss(); if ($("w-glide")) glide(); scenarios(); }, 150);
  });

  if ($("pg-form")) recompute();
  else if ($("w-year") || $("mc-plot")) { run = E.simulate(state); yearWidget(); scenarios(); }

  // ---- code map filter --------------------------------------------------------
  var q = $("cm-q");
  if (q) q.addEventListener("input", function () {
    var term = q.value.trim().toLowerCase();
    Array.prototype.forEach.call(document.querySelectorAll("#codemap tbody tr"), function (tr) { tr.hidden = term !== "" && tr.textContent.toLowerCase().indexOf(term) === -1; });
  });
})();
`;
