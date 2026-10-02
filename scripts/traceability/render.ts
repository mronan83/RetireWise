/**
 * docs/REQUIREMENTS.md → the RetireWise Requirements & Feature Traceability page.
 *
 * A view only: the markdown file holds the content and git holds its history.
 * File links point at the commit the page was built for, so a reader follows
 * the code that is live, not whatever main has moved on to.
 */
import {
  STATUSES,
  areaOf,
  backlogIn,
  idsIn,
  statusOf,
  type Block,
  type Entry,
  type Report,
  type Trace,
} from "./model";

const REPO_URL = "https://github.com/mronan83/RetireWise";
const BACKLOG_URL = "https://claude.ai/artifact/F3ADTDsC9HU4ZpyvSzyr6R";

export interface TraceRelease {
  sha: string;
  previousSha?: string;
  date: string;
  firstPublication: boolean;
  /** A build from a branch or for review, not a release: the page must not claim to be live. */
  preview?: boolean;
  /** "FR-NW-01: Partial → Verified", new IDs, and the like. */
  changes: string[];
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

const anchor = (id: string) => id.toLowerCase();

function makeInline(sha: string, defined: Set<string>) {
  const fileLink = (path: string, line?: string) => {
    const href = `${REPO_URL}/blob/${sha}/${path.split("/").map(encodeURIComponent).join("/")}${line ? `#L${line.replace("-", "-L")}` : ""}`;
    return `<a class="file" href="${esc(href)}" target="_blank" rel="noopener"><code>${esc(path)}${line ? `:${esc(line)}` : ""}</code></a>`;
  };
  return (s: string): string =>
    s
      .split(/(`[^`]+`)/)
      .map((part) => {
        if (part.length > 1 && part.startsWith("`") && part.endsWith("`")) {
          const inner = part.slice(1, -1);
          const m = inner.match(/^((?:src|scripts|e2e|docs|\.github|public)\/[^\s:]+|[A-Za-z0-9_.-]+\.(?:json|md|ts|mjs|yml))(?::(\d+(?:-\d+)?))?$/);
          return m ? fileLink(m[1], m[2]) : `<code>${esc(inner)}</code>`;
        }
        return esc(part)
          .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
          .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
          .replace(/\b(BO-\d+|NFR-[A-Z]+-\d{2}|FR-[A-Z]+-\d{2}|F-\d{2}|GAP-\d{2}|Q\d+)\b/g, (id: string) =>
            defined.has(id) ? `<a class="ref" href="#${anchor(id)}">${id}</a>` : id
          )
          .replace(/(^|[\s(,;])#(\d+)\b/g, (_m, pre: string, n: string) =>
            `${pre}<a class="ref bl" href="${BACKLOG_URL}#item-${n}" target="_blank" rel="noopener" title="Backlog item ${n}">#${n}</a>`
          );
      })
      .join("");
}

const STATUS_HELP: Record<string, string> = {
  Verified: "built, and a check that runs in CI fails if it breaks",
  Implemented: "built, but nothing automated proves it",
  Partial: "built with a known shortfall, named by a backlog item or gap",
  Planned: "agreed, not built",
  Deferred: "set aside by decision",
};
/**
 * Give every table cell its column's heading as data-label, so a phone can
 * show each row as a labelled card instead of a seven-column scroll.
 */
function labelCells(html: string): string {
  return html.replace(/<table class="trace">([\s\S]*?)<\/table>/g, (table, inner: string) => {
    const heads = [...inner.matchAll(/<th scope="col">([\s\S]*?)<\/th>/g)].map((m) => m[1].replace(/<[^>]+>/g, ""));
    if (heads.length === 0) return table;
    return table.replace(/<tr\b[^>]*>[\s\S]*?<\/tr>/g, (row) => {
      let i = 0;
      return row.replace(/<td\b/g, () => `<td data-label="${heads[i++] ?? ""}"`);
    });
  });
}

const pill = (status: string) => `<span class="pill st-${status.toLowerCase()}">${esc(status)}</span>`;

export function renderTracePage(t: Trace, report: Report, r: TraceRelease): string {
  const defined = new Set(
    [...t.objectives, ...t.functional, ...t.nonFunctional, ...t.features, ...t.gaps, ...t.questions].map((e) => e.id)
  );
  const inline = makeInline(r.sha, defined);
  const blocks = (bs: Block[], cls = "") =>
    bs
      .map((b) =>
        b.kind === "p"
          ? `<p${cls ? ` class="${cls}"` : ""}>${inline(b.text)}</p>`
          : `<ul${cls ? ` class="${cls}"` : ""}>${b.items.map((i) => `<li>${inline(i)}</li>`).join("")}</ul>`
      )
      .join("");
  const cell = (v: string | undefined) => (v ? inline(v) : `<span class="none">—</span>`);
  const commit = (sha: string) =>
    `<a href="${REPO_URL}/commit/${esc(sha)}" target="_blank" rel="noopener"><code>${esc(sha.slice(0, 7))}</code></a>`;
  const reqs = [...t.functional, ...t.nonFunctional];
  const count = (es: Entry[], s: string) => es.filter((e) => statusOf(e) === s).length;
  const openGaps = t.gaps.filter((g) => (g.fields.Status ?? "").startsWith("Open"));
  const openQs = t.questions.filter((q) => (q.fields.Status ?? "").startsWith("Open"));
  const stat = (n: number | string, label: string) => `<div class="stat"><span class="n">${n}</span><span class="l">${label}</span></div>`;

  const statusBar = (es: Entry[], label: string) => {
    const segs = STATUSES.filter((s) => count(es, s) > 0)
      .map((s) => `<span class="seg seg-${s.toLowerCase()}" style="flex:${count(es, s)}" title="${label}: ${count(es, s)} ${s.toLowerCase()}">${count(es, s)}</span>`)
      .join("");
    const legend = STATUSES.filter((s) => count(es, s) > 0).map((s) => `${count(es, s)} ${s.toLowerCase()}`).join(" · ");
    return `<div class="bar" role="img" aria-label="${esc(label)}: ${legend}">${segs}</div><p class="note bar-legend">${legend}</p>`;
  };

  const rowAttrs = (e: Entry) =>
    `id="${anchor(e.id)}" data-row data-status="${esc(statusOf(e))}"`;
  const titleCell = (e: Entry) => `<span class="item-name">${inline(e.title)}</span>${blocks(e.body, "desc")}`;

  const reqTable = (es: Entry[], nf: boolean) => `<div class="table-wrap"><table class="trace">
<thead><tr><th scope="col">ID</th><th scope="col">Requirement</th>${nf ? '<th scope="col">How it is enforced</th>' : ""}<th scope="col">Source</th><th scope="col">Priority</th><th scope="col">Status</th>${nf ? "" : '<th scope="col">Features</th>'}<th scope="col">Verified by</th></tr></thead>
<tbody>${es
    .map(
      (e) => `<tr ${rowAttrs(e)}><td class="id">${e.id}</td><td class="item">${titleCell(e)}</td>${nf ? `<td class="paths">${cell(e.fields["Enforced by"])}</td>` : ""}<td class="src">${cell(e.fields.Source)}</td><td><span class="pr pr-${(e.fields.Priority ?? "").toLowerCase()}">${esc(e.fields.Priority ?? "")}</span></td><td>${pill(statusOf(e))}${e.fields.Backlog ? `<div class="sub">${inline(e.fields.Backlog)}</div>` : ""}${e.fields.Gap ? `<div class="sub">${inline(e.fields.Gap)}</div>` : ""}</td>${nf ? "" : `<td class="refs">${cell(e.fields.Features)}</td>`}<td class="paths">${cell(e.fields["Verified by"])}</td></tr>`
    )
    .join("\n")}</tbody></table></div>`;

  const areaSections = (kind: "FR" | "NFR") =>
    t.areas
      .filter((a) => a.kind === kind)
      .map((a) => {
        const es = (kind === "FR" ? t.functional : t.nonFunctional).filter((e) => areaOf(e.id) === a.code);
        if (es.length === 0) return "";
        return `<section class="area" id="area-${kind.toLowerCase()}-${a.code.toLowerCase()}"><h3>${esc(a.name)} <span class="code">(${a.code})</span></h3>${statusBar(es, a.name)}${reqTable(es, kind === "NFR")}</section>`;
      })
      .join("\n");

  const groups = [...new Set(t.features.map((f) => f.fields.Group))];
  const featureSections = groups
    .map((g) => {
      const fs = t.features.filter((f) => f.fields.Group === g);
      return `<section class="area"><h3>${esc(g)}</h3><div class="table-wrap"><table class="trace">
<thead><tr><th scope="col">ID</th><th scope="col">Feature</th><th scope="col">Status</th><th scope="col">Requirements</th><th scope="col">Code</th><th scope="col">Checks</th></tr></thead>
<tbody>${fs
        .map(
          (f) => `<tr ${rowAttrs(f)}><td class="id">${f.id}</td><td class="item">${titleCell(f)}${f.fields.Decisions ? `<p class="sub">Decided in ${inline(f.fields.Decisions)}</p>` : ""}</td><td>${pill(statusOf(f))}${f.fields.Backlog ? `<div class="sub">${inline(f.fields.Backlog)}</div>` : ""}</td><td class="refs">${cell(f.fields.Requirements)}</td><td class="paths">${cell(f.fields.Code)}</td><td class="paths">${cell(f.fields.Checks)}</td></tr>`
        )
        .join("\n")}</tbody></table></div></section>`;
    })
    .join("\n");

  const gapRows = t.gaps
    .map(
      (g) => `<tr id="${anchor(g.id)}"><td class="id">${g.id}</td><td class="item">${titleCell(g)}</td><td class="refs">${cell(g.fields.Affects)}</td><td><span class="pill sv-${(g.fields.Severity ?? "").toLowerCase()}">${esc(g.fields.Severity ?? "")}</span></td><td class="paths">${cell(g.fields.Evidence)}</td><td class="refs">${cell(g.fields.Backlog)}</td><td class="src">${esc(g.fields.Status ?? "")}</td></tr>`
    )
    .join("\n");

  const unchecked = [...reqs, ...t.features].filter((e) => statusOf(e) === "Implemented");
  const backlogMap = new Map<number, { reqs: string[]; feats: string[]; gaps: string[] }>();
  const note = (n: number, key: "reqs" | "feats" | "gaps", id: string) => {
    const v = backlogMap.get(n) ?? { reqs: [], feats: [], gaps: [] };
    if (!v[key].includes(id)) v[key].push(id);
    backlogMap.set(n, v);
  };
  reqs.forEach((e) => backlogIn(e.fields.Backlog).forEach((n) => note(n, "reqs", e.id)));
  t.features.forEach((e) => backlogIn(e.fields.Backlog).forEach((n) => note(n, "feats", e.id)));
  t.gaps.forEach((g) => backlogIn(g.fields.Backlog).forEach((n) => {
    note(n, "gaps", g.id);
    idsIn(g.fields.Affects).forEach((id) => note(n, id.startsWith("F-") ? "feats" : "reqs", id));
  }));
  const idList = (xs: string[]) => (xs.length ? inline(xs.join(", ")) : `<span class="none">—</span>`);
  const backlogRows = [...backlogMap.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([n, v]) => `<tr><td class="id">${inline(`#${n}`)}</td><td class="refs">${idList(v.gaps)}</td><td class="refs">${idList(v.reqs)}</td><td class="refs">${idList(v.feats)}</td></tr>`)
    .join("\n");

  const questions = t.questions
    .map((q) => {
      const answered = (q.fields.Status ?? "").startsWith("Answered");
      return `<li id="${anchor(q.id)}" class="${answered ? "done" : "open"}"><span class="box" aria-hidden="true">${answered ? "✓" : ""}</span><div class="li-body"><p><b>${q.id} ${inline(q.title)}</b> <span class="note">· ${esc(q.fields.Status ?? "")}${q.fields.Decides ? ` · decides ${inline(q.fields.Decides)}` : ""}</span></p>${blocks(q.body)}</div></li>`;
    })
    .join("\n");

  const verifiedShare = reqs.length ? Math.round((count(reqs, "Verified") / reqs.length) * 100) : 0;

  return labelCells(`<title>RetireWise Requirements &amp; Feature Traceability</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@87..100,500..800&family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:wght@400;500;600;700&display=swap">
<style>${CSS}</style>
<div class="page">
<header class="hero">
  <p class="eyebrow">RetireWise · Requirements</p>
  <h1>Requirements &amp; Feature Traceability</h1>
  <p class="meta">${r.preview ? `<b>Preview, not released.</b> Built from ${commit(r.sha)}` : `As live in production at ${commit(r.sha)}`} · ${esc(r.date)} · last reviewed ${esc(t.lastReviewed)}</p>
  ${blocks(t.intro, "lede")}
  <div class="stats">${stat(reqs.length, "requirements")}${stat(`${verifiedShare}<small>%</small>`, "verified in CI")}${stat(count(reqs, "Partial"), "partial")}${stat(count(reqs, "Planned") + count(reqs, "Deferred"), "planned or deferred")}${stat(t.features.length, "features")}${stat(openGaps.length, "open gaps")}${stat(openQs.length, "open questions")}</div>
  <div class="release" role="status"><p class="eyebrow">This release</p>${
    r.firstPublication
      ? `<p class="note">First publication of this document.</p>`
      : r.changes.length
        ? `<ul class="changes">${r.changes.map((c) => `<li>${inline(c)}</li>`).join("")}</ul>`
        : `<p class="note">No requirement, feature, gap or question changed since ${r.previousSha ? commit(r.previousSha) : "the last release"}.</p>`
  }</div>
  <p class="source">Generated from <a href="${REPO_URL}/blob/${esc(r.sha)}/docs/REQUIREMENTS.md" target="_blank" rel="noopener"><code>docs/REQUIREMENTS.md</code></a> at ${commit(r.sha)}. The file is where requirements are edited; git keeps every version.</p>
</header>
<div class="layout">
<nav class="toc" aria-label="Contents"><p class="eyebrow">Contents</p><ol>
  <li><a href="#how">How this document works</a></li>
  <li><a href="#objectives">Business objectives</a></li>
  <li><a href="#functional">Functional requirements</a></li>
  <li><a href="#non-functional">Non-functional requirements</a></li>
  <li><a href="#features">Feature inventory</a></li>
  <li><a href="#coverage">Coverage and gaps</a></li>
  <li><a href="#questions">Open questions</a></li>
  <li><a href="#log">Change log</a></li>
  <li><a href="#sources">Sources</a></li>
</ol></nav>
<main>
<div class="filterbar" role="search">
  <label for="q" class="sr">Filter rows</label>
  <input id="q" type="search" placeholder="Filter rows: an ID, a file, a word…" autocomplete="off">
  <div class="chips" role="group" aria-label="Show rows by status">${["All", ...STATUSES]
    .map((s, i) => `<button type="button" class="chip${i === 0 ? " on" : ""}" data-filter="${s}" aria-pressed="${i === 0}">${s === "Implemented" ? "Built, no check" : s}</button>`)
    .join("")}</div>
  <p id="count" class="note" aria-live="polite"></p>
</div>

<section id="how"><h2>How this document works</h2>
${blocks(t.method)}
<figure class="model">
  <div class="model-scroll">${TRACE_SVG}</div>
  <figcaption>Read down for scope: each objective is served by requirements, each requirement is delivered by features, and each feature is built in code and proved by checks. Read up for confidence: a requirement is only as far along as its weakest feature.</figcaption>
</figure>
<dl class="defs">${STATUSES.map((s) => `<dt>${pill(s)}</dt><dd>${STATUS_HELP[s]}</dd>`).join("")}</dl>
</section>

<section id="objectives"><h2>Business objectives</h2>
<div class="table-wrap"><table class="trace"><thead><tr><th scope="col">ID</th><th scope="col">Objective</th><th scope="col">Where it is stated</th><th scope="col">Served by</th></tr></thead>
<tbody>${t.objectives
    .map((o) => `<tr id="${anchor(o.id)}"><td class="id">${o.id}</td><td class="item">${titleCell(o)}${o.fields.Measure ? `<p class="sub">Measure: ${inline(o.fields.Measure)}</p>` : ""}</td><td class="src">${cell(o.fields["Stated in"])}</td><td class="refs">${o.fields["Served by"]
      .split(/,\s*/)
      .map((s) => (/^(FR|NFR)-[A-Z]+$/.test(s) ? `<a class="ref" href="#area-${s.toLowerCase()}">${s}</a>` : inline(s)))
      .join(", ")}</td></tr>`)
    .join("\n")}</tbody></table></div>
<p class="note">Areas: ${t.areas.map((a) => `<a class="ref" href="#area-${a.kind.toLowerCase()}-${a.code.toLowerCase()}">${a.kind}-${a.code}</a> ${esc(a.name)}`).join(" · ")}</p>
</section>

<section id="functional"><h2>Functional requirements</h2>
<p class="note">What RetireWise must do for a household. Priority is MoSCoW (Must, Should, Could) and ranks requirements; the backlog's P1–P3 ranks work, so the two scales differ on purpose.</p>
${areaSections("FR")}
</section>

<section id="non-functional"><h2>Non-functional requirements</h2>
<p class="note">How well it must do it: security, integrity, operations and the rest.</p>
${areaSections("NFR")}
</section>

<section id="features"><h2>Feature inventory</h2>
<p class="note">Everything built or agreed, with the code that delivers it and the checks that prove it. Every page and API route belongs to at least one feature; the build fails if one does not.</p>
${featureSections}
</section>

<section id="coverage"><h2>Coverage and gaps</h2>
<h3>Gaps found while tracing</h3>
<p class="note">Places where the code falls short of a requirement. Each is also a backlog item, and the build fails if the two disagree about whether it is open.</p>
<div class="table-wrap"><table class="trace"><thead><tr><th scope="col">ID</th><th scope="col">Gap</th><th scope="col">Affects</th><th scope="col">Severity</th><th scope="col">Evidence</th><th scope="col">Backlog</th><th scope="col">Status</th></tr></thead>
<tbody>${gapRows}</tbody></table></div>
<h3>Built but not checked</h3>
<p class="note">Status Implemented: working today, with nothing automated to say when it stops.</p>
${unchecked.length ? `<ul class="idlist">${unchecked.map((e) => `<li>${inline(e.id)} ${inline(e.title)}</li>`).join("")}</ul>` : `<p class="note">None.</p>`}
<h3>Features with no requirement</h3>
${report.featuresWithoutRequirement.length ? `<ul class="idlist">${report.featuresWithoutRequirement.map((id) => `<li>${inline(id)} ${inline(t.features.find((f) => f.id === id)?.title ?? "")}</li>`).join("")}</ul>` : `<p class="note">None. Every feature serves at least one requirement.</p>`}
<h3>What each backlog item holds back</h3>
<div class="table-wrap"><table class="trace"><thead><tr><th scope="col">Backlog</th><th scope="col">Gaps</th><th scope="col">Requirements</th><th scope="col">Features</th></tr></thead><tbody>${backlogRows}</tbody></table></div>
</section>

<section id="questions"><h2>Open questions</h2>
<p class="note">${openQs.length} of ${t.questions.length} open. Each one confirms a requirement, closes a gap, or sets a target nobody has written down yet. Answer in chat or in a comment; Claude records the answer here and changes what it decides.</p>
<ol class="checklist">${questions}</ol>
</section>

<section id="log"><h2>Change log</h2>
<div class="table-wrap"><table class="trace"><thead><tr><th scope="col">Date</th><th scope="col">Change</th><th scope="col">By</th></tr></thead>
<tbody>${[...t.log].reverse().map((l) => `<tr><td class="id">${esc(l.date)}</td><td>${inline(l.change)}</td><td class="src">${esc(l.by)}</td></tr>`).join("\n")}</tbody></table></div>
</section>

<section id="sources"><h2>Sources</h2>
<ul>${t.sources.map((s) => `<li>${inline(s)}</li>`).join("")}</ul>
</section>
</main>
</div>
<p class="foot">${r.preview ? "A preview for review. The published page is built only after a successful <code>pnpm deploy:prod</code>, so it describes what is live." : "Published after a successful <code>pnpm deploy:prod</code>, so this page describes what is live."} Built by <code>scripts/build-traceability.ts</code>, which also checks every claim above against the repository: <code>pnpm trace:check</code>.</p>
</div>
<script>${JS}</script>
`);
}

const TRACE_SVG = `<svg viewBox="0 0 900 190" role="img" aria-label="Trace model: a business objective is served by requirements; a requirement is delivered by features; a feature is built in code and proved by checks. Gaps link a requirement to the backlog item that will close it.">
<defs><marker id="tm-a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" class="mk"/></marker></defs>
<rect x="10" y="20" width="150" height="56" rx="6" class="nd"/><text x="85" y="44" class="t" text-anchor="middle">Objective</text><text x="85" y="62" class="s" text-anchor="middle">BO-n</text>
<rect x="210" y="20" width="170" height="56" rx="6" class="nd"/><text x="295" y="44" class="t" text-anchor="middle">Requirement</text><text x="295" y="62" class="s" text-anchor="middle">FR-AREA-nn · NFR-AREA-nn</text>
<rect x="430" y="20" width="150" height="56" rx="6" class="nd nd-acc"/><text x="505" y="44" class="t" text-anchor="middle">Feature</text><text x="505" y="62" class="s" text-anchor="middle">F-nn</text>
<rect x="640" y="4" width="250" height="40" rx="6" class="nd"/><text x="765" y="22" class="t" text-anchor="middle">Code</text><text x="765" y="37" class="s" text-anchor="middle">src/… (exists, or the build fails)</text>
<rect x="640" y="54" width="250" height="40" rx="6" class="nd"/><text x="765" y="72" class="t" text-anchor="middle">Check</text><text x="765" y="87" class="s" text-anchor="middle">scripts/test-*, e2e/* (runs in CI)</text>
<rect x="210" y="120" width="170" height="56" rx="6" class="nd nd-gap"/><text x="295" y="144" class="t" text-anchor="middle">Gap</text><text x="295" y="162" class="s" text-anchor="middle">GAP-nn</text>
<rect x="430" y="120" width="150" height="56" rx="6" class="nd"/><text x="505" y="144" class="t" text-anchor="middle">Backlog item</text><text x="505" y="162" class="s" text-anchor="middle">#n</text>
<path d="M160,48 H208" class="e" marker-end="url(#tm-a)"/><text x="184" y="40" class="el" text-anchor="middle">served by</text>
<path d="M380,48 H428" class="e" marker-end="url(#tm-a)"/><text x="404" y="40" class="el" text-anchor="middle">delivered by</text>
<path d="M580,40 H610 V24 H638" class="e" marker-end="url(#tm-a)"/><text x="612" y="16" class="el" text-anchor="middle">built in</text>
<path d="M580,56 H610 V74 H638" class="e" marker-end="url(#tm-a)"/><text x="612" y="102" class="el" text-anchor="middle">proved by</text>
<path d="M295,76 V118" class="e" marker-end="url(#tm-a)"/><text x="303" y="102" class="el">falls short</text>
<path d="M380,148 H428" class="e" marker-end="url(#tm-a)"/><text x="404" y="140" class="el" text-anchor="middle">closed by</text>
</svg>`;

const CSS = `
/* Layout: a contents rail beside one reading column; wide tables scroll inside the column. */
:root {
  --paper: #F4F6F5; --panel: #FFFFFF; --soft: #E8EDEB; --ink: #15201C; --muted: #56645F; --line: #CBD4D0; --line-strong: #9AA8A2;
  --accent: #0A6A64; --accent-soft: #D9EEEB;
  --good: #2C7738; --good-soft: #DFF0E2; --warn: #8F5B00; --warn-soft: #F6E9CE; --bad: #AE3427; --bad-soft: #F7DFDB;
  --plan: #3B5A93; --plan-soft: #E3EAF6; --quiet: #ECEFEE;
  --display: "Archivo", "Helvetica Neue", Arial, sans-serif;
  --body: "IBM Plex Sans", system-ui, -apple-system, "Segoe UI", sans-serif;
  --mono: "IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) {
  --paper: #101614; --panel: #17201D; --soft: #1C2623; --ink: #E3EAE7; --muted: #9AA7A2; --line: #2E3A36; --line-strong: #4F5D58;
  --accent: #45B8AE; --accent-soft: #15332F;
  --good: #62BB6F; --good-soft: #17301B; --warn: #E0A640; --warn-soft: #33280F; --bad: #EC6E60; --bad-soft: #3A1C18;
  --plan: #9DB6E6; --plan-soft: #1D2A44; --quiet: #1F2926; color-scheme: dark; } }
:root[data-theme="dark"] {
  --paper: #101614; --panel: #17201D; --soft: #1C2623; --ink: #E3EAE7; --muted: #9AA7A2; --line: #2E3A36; --line-strong: #4F5D58;
  --accent: #45B8AE; --accent-soft: #15332F;
  --good: #62BB6F; --good-soft: #17301B; --warn: #E0A640; --warn-soft: #33280F; --bad: #EC6E60; --bad-soft: #3A1C18;
  --plan: #9DB6E6; --plan-soft: #1D2A44; --quiet: #1F2926; color-scheme: dark; }
*, *::before, *::after { box-sizing: border-box; }
body { background: var(--paper); color: var(--ink); font: 400 16px/1.55 var(--body); }
.page { max-width: 1320px; margin: 0 auto; padding-inline: 20px; padding-block: 36px 64px; display: grid; gap: 32px; }
a { color: var(--accent); text-underline-offset: 2px; }
:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; border-radius: 3px; }
code { font-family: var(--mono); font-size: 0.82em; background: var(--soft); padding: 0.05em 0.35em; border-radius: 3px; overflow-wrap: anywhere; }
a.file { text-decoration: none; }
a.file code { color: var(--accent); }
h1, h2, h3 { font-family: var(--display); font-stretch: 90%; text-wrap: balance; margin: 0; letter-spacing: -0.01em; }
h1 { font-size: clamp(1.9rem, 4vw, 2.6rem); font-weight: 750; line-height: 1.08; }
h2 { font-size: 1.45rem; font-weight: 700; line-height: 1.2; padding-top: 6px; }
h3 { font-size: 1.1rem; font-weight: 700; }
h3 .code { font-family: var(--mono); font-size: 0.8em; color: var(--muted); font-weight: 500; }
p { margin: 0; max-width: 76ch; }
.eyebrow { font: 500 0.75rem/1.2 var(--mono); letter-spacing: 0.08em; text-transform: uppercase; color: var(--muted); margin: 0; }
.hero { display: grid; gap: 12px; }
.meta, .source, .note { color: var(--muted); font-size: 0.92rem; }
.lede { font-size: 1.06rem; max-width: 74ch; }
.stats { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 4px; }
.stat { background: var(--panel); border: 1px solid var(--line); border-radius: 8px; padding: 10px 16px; display: grid; min-width: 120px; }
.stat .n { font: 750 1.6rem/1.1 var(--display); font-variant-numeric: tabular-nums; }
.stat .n small { font-size: 0.9rem; color: var(--muted); }
.stat .l { font-size: 0.85rem; color: var(--muted); }
.release { background: var(--panel); border: 1px solid var(--line); border-left: 4px solid var(--accent); border-radius: 8px; padding: 12px 16px; display: grid; gap: 6px; max-width: 86ch; }
.release ul { margin: 0; padding-left: 1.1em; display: grid; gap: 2px; font-size: 0.92rem; }
.layout { display: grid; grid-template-columns: 220px minmax(0, 1fr); gap: 32px; align-items: start; }
.toc { position: sticky; top: calc(env(safe-area-inset-top, 0px) + 16px); display: grid; gap: 8px; }
.toc ol { list-style: none; margin: 0; padding: 0; display: grid; gap: 2px; border-left: 2px solid var(--line); }
.toc a { display: block; padding: 3px 0 3px 12px; color: var(--ink); text-decoration: none; font-size: 0.94rem; }
.toc a:hover { color: var(--accent); }
main { display: grid; gap: 32px; min-width: 0; }
section { display: grid; gap: 14px; min-width: 0; scroll-margin-top: 100px; }
section > ul, .idlist { margin: 0; padding-left: 1.2em; display: grid; gap: 6px; max-width: 86ch; }
.area { gap: 10px; }
.filterbar { position: sticky; top: env(safe-area-inset-top, 0px); z-index: 2; background: var(--paper); padding-block: 10px; border-bottom: 1px solid var(--line); display: flex; flex-wrap: wrap; gap: 8px 12px; align-items: center; }
.filterbar input { flex: 1 1 240px; min-width: 0; font: inherit; font-size: 0.95rem; padding: 8px 12px; border: 1px solid var(--line-strong); border-radius: 6px; background: var(--panel); color: var(--ink); }
.chips { display: flex; flex-wrap: wrap; gap: 6px; }
.chip { font: inherit; font-size: 0.85rem; padding: 5px 11px; border-radius: 999px; border: 1px solid var(--line-strong); background: var(--panel); color: var(--ink); cursor: pointer; }
.chip.on { background: var(--accent); color: var(--paper); border-color: var(--accent); }
#count { flex-basis: 100%; }
.sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
.table-wrap { overflow-x: auto; border: 1px solid var(--line); border-radius: 8px; background: var(--panel); }
table { width: 100%; border-collapse: collapse; font-size: 0.9rem; }
th, td { text-align: left; vertical-align: top; padding: 9px 11px; border-bottom: 1px solid var(--line); }
tr:last-child td { border-bottom: 0; }
th { font: 500 0.7rem/1.2 var(--mono); letter-spacing: 0.07em; text-transform: uppercase; color: var(--muted); background: var(--soft); white-space: nowrap; }
tr:target td { background: var(--warn-soft); }
tr[id] { scroll-margin-top: 130px; }
td.id { font-family: var(--mono); font-size: 0.8rem; white-space: nowrap; font-weight: 500; }
td.item { min-width: 14rem; }
td.paths { min-width: 10rem; font-size: 0.84rem; }
td.refs { min-width: 6rem; font-size: 0.86rem; }
td.src { min-width: 6rem; font-size: 0.84rem; color: var(--muted); }
.item-name { font-weight: 700; }
.desc { color: var(--muted); font-size: 0.88rem; margin-top: 4px; max-width: none; }
ul.desc { padding-left: 1.1em; margin: 4px 0 0; }
.sub { font-size: 0.8rem; color: var(--muted); margin-top: 4px; }
.none { color: var(--line-strong); }
a.ref { font-family: var(--mono); font-size: 0.9em; text-decoration: none; border-bottom: 1px dotted currentColor; white-space: nowrap; }
.pill { display: inline-block; font-size: 0.74rem; font-weight: 700; padding: 2px 8px; border-radius: 999px; white-space: nowrap; }
.st-verified { background: var(--good-soft); color: var(--good); }
.st-implemented { background: var(--quiet); color: var(--muted); }
.st-partial { background: var(--warn-soft); color: var(--warn); }
.st-planned { background: var(--plan-soft); color: var(--plan); }
.st-deferred { background: transparent; color: var(--muted); border: 1px dashed var(--line-strong); }
.sv-high { background: var(--bad-soft); color: var(--bad); }
.sv-medium { background: var(--warn-soft); color: var(--warn); }
.sv-low { background: var(--quiet); color: var(--muted); }
.pr { font: 500 0.8rem/1 var(--mono); }
.pr-must { font-weight: 700; }
.pr-could { color: var(--muted); }
.bar { display: flex; height: 22px; border-radius: 6px; overflow: hidden; border: 1px solid var(--line); max-width: 640px; }
.seg { display: grid; place-items: center; font: 600 0.72rem/1 var(--mono); min-width: 22px; }
.seg-verified { background: var(--good-soft); color: var(--good); }
.seg-implemented { background: var(--quiet); color: var(--muted); }
.seg-partial { background: var(--warn-soft); color: var(--warn); }
.seg-planned { background: var(--plan-soft); color: var(--plan); }
.seg-deferred { background: var(--panel); color: var(--muted); }
.bar-legend { font-size: 0.8rem; margin-top: -4px; }
.model { margin: 0; display: grid; gap: 8px; }
.model-scroll { overflow-x: auto; background: var(--panel); border: 1px solid var(--line); border-radius: 8px; padding: 12px; }
.model svg { display: block; width: 100%; min-width: 640px; height: auto; }
.model figcaption { color: var(--muted); font-size: 0.88rem; max-width: 80ch; }
.nd { fill: var(--panel); stroke: var(--line-strong); stroke-width: 1.2; }
.nd-acc { fill: var(--accent-soft); stroke: var(--accent); }
.nd-gap { fill: var(--warn-soft); stroke: var(--warn); stroke-dasharray: 5 4; }
.t { font: 600 13px var(--body); fill: var(--ink); }
.s { font: 400 11px var(--mono); fill: var(--muted); }
.el { font: 400 11px var(--mono); fill: var(--muted); }
.e { fill: none; stroke: var(--ink); stroke-width: 1.3; }
.mk { fill: var(--ink); }
.defs { display: grid; grid-template-columns: max-content minmax(0, 1fr); gap: 8px 16px; margin: 0; max-width: 80ch; align-items: baseline; }
.defs dd { margin: 0; color: var(--muted); }
.checklist { list-style: none; padding: 0; margin: 0; display: grid; gap: 12px; max-width: 86ch; }
.checklist > li { display: grid; grid-template-columns: 22px minmax(0, 1fr); gap: 10px; padding: 12px 14px; background: var(--panel); border: 1px solid var(--line); border-radius: 8px; scroll-margin-top: 100px; }
.checklist > li.open { border-color: var(--warn); }
.checklist > li:target { outline: 2px solid var(--accent); }
.box { width: 20px; height: 20px; border-radius: 4px; border: 1.5px solid var(--line-strong); display: grid; place-items: center; font-size: 0.8rem; color: var(--good); }
li.done .box { border-color: var(--good); background: var(--good-soft); }
.li-body { display: grid; gap: 8px; min-width: 0; }
.foot { border-top: 1px solid var(--line); padding-top: 16px; color: var(--muted); font-size: 0.88rem; max-width: none; }
@media (max-width: 900px) {
  .layout { grid-template-columns: minmax(0, 1fr); }
  .toc { position: static; }
  .toc ol { grid-template-columns: repeat(auto-fill, minmax(170px, 1fr)); border-left: 0; }
  .toc a { padding-left: 0; }
}
@media (max-width: 560px) {
  .page { padding-inline: 16px; padding-block: 24px 48px; }
  th, td { padding: 8px 9px; }
  .defs { grid-template-columns: minmax(0, 1fr); gap: 2px; }
  .defs dd { margin-bottom: 8px; }
  .table-wrap { overflow-x: visible; border: 0; background: transparent; }
  table.trace, table.trace tbody, table.trace tr, table.trace td { display: block; width: 100%; }
  table.trace thead { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
  table.trace tr { background: var(--panel); border: 1px solid var(--line); border-radius: 8px; margin-bottom: 10px; padding: 4px 0; }
  table.trace tr[hidden] { display: none; }
  table.trace td { border-bottom: 0; padding: 5px 12px; min-width: 0; }
  table.trace td[data-label]::before { content: attr(data-label); display: block; font: 500 0.66rem/1.4 var(--mono); letter-spacing: 0.07em; text-transform: uppercase; color: var(--muted); }
  table.trace td.id::before, table.trace td.item::before { display: none; }
  table.trace td:has(> .none:only-child) { display: none; }
  tr[id] { scroll-margin-top: 190px; }
}
@media (prefers-reduced-motion: reduce) { * { scroll-behavior: auto !important; } }
`;

const JS = `
(function () {
  var q = document.getElementById("q");
  var chips = Array.prototype.slice.call(document.querySelectorAll(".chip"));
  var rows = Array.prototype.slice.call(document.querySelectorAll("tr[data-row]"));
  var count = document.getElementById("count");
  var mode = "All";
  function apply() {
    var term = q.value.trim().toLowerCase();
    var shown = 0;
    rows.forEach(function (r) {
      var okMode = mode === "All" || r.dataset.status === mode;
      var okText = !term || r.textContent.toLowerCase().indexOf(term) !== -1;
      r.hidden = !(okMode && okText);
      if (!r.hidden) shown++;
    });
    count.textContent = shown === rows.length ? "Showing all " + rows.length + " requirements and features" : "Showing " + shown + " of " + rows.length + " requirements and features";
  }
  function setMode(m) {
    mode = m;
    chips.forEach(function (c) { var on = c.dataset.filter === m; c.classList.toggle("on", on); c.setAttribute("aria-pressed", String(on)); });
    apply();
  }
  chips.forEach(function (c) { c.addEventListener("click", function () { setMode(c.dataset.filter); }); });
  q.addEventListener("input", apply);
  window.addEventListener("hashchange", function () {
    var t = document.getElementById(location.hash.slice(1));
    if (t && t.hidden) { q.value = ""; setMode("All"); t.scrollIntoView(); }
  });
  apply();
})();
`;
