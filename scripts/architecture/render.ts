/**
 * The technical architecture page: docs/ARCHITECTURE.md as written, followed
 * by an inventory read from the code and a record of what the document has
 * to name and does.
 */
import { anchor, esc, makeInline, REPO_URL } from "../pages/inline";
import { renderBlocks, type Block, type Entry, type Section } from "../pages/markdown";
import { BASE_CSS, DOC_CSS, FONTS } from "../pages/theme";
import { DOC_FILE, type ArchDoc, type ArchReport, type Inventory } from "./model";

export type ArchRelease = {
  sha: string;
  date: string;
  previousSha?: string;
  firstPublication: boolean;
  changes: string[];
  preview?: boolean;
};

/** "0 22 * * 1-5" → "22:00 UTC, Monday to Friday", for the schedules in use. */
export function describeCron(expr: string): string {
  const [min, hour, dom, mon, dow] = expr.split(/\s+/);
  if (!/^\d+$/.test(min) || !/^\d+$/.test(hour) || dom !== "*" || mon !== "*") return expr;
  const time = `${hour.padStart(2, "0")}:${min.padStart(2, "0")} UTC`;
  const days: Record<string, string> = { "*": "every day", "1-5": "Monday to Friday", "0,6": "weekends", "6,0": "weekends" };
  return `${time}, ${days[dow] ?? `days ${dow}`}`;
}

const SESSION_HELP: Record<string, string> = {
  proxy: "The proxy requires a signed-in session",
  machine: "Machine route: a bearer secret or a signature, never a session",
  "own check": "Not on the proxy's list; the route checks the session itself",
  public: "Public",
};

const statusPill = (status: string) => {
  const s = status.split(/\s/)[0];
  const cls = s === "Accepted" ? "ok" : s === "Superseded" || s === "Deprecated" ? "" : "plan";
  return `<span class="badge ${cls}">${esc(status)}</span>`;
};

export function renderArchPage(a: ArchDoc, inv: Inventory, report: ArchReport, r: ArchRelease): string {
  const local = new Map<string, string>(a.decisions.filter((d) => d.id).map((d) => [d.id, d.id.toLowerCase()] as [string, string]));
  const inline = makeInline(r.sha, local);
  const blocks = (bs: Block[], cls = "") => renderBlocks(bs, inline, cls);
  const commit = (sha: string) =>
    `<a href="${REPO_URL}/commit/${esc(sha)}" target="_blank" rel="noopener"><code>${esc(sha.slice(0, 7))}</code></a>`;
  const fileAt = (path: string) =>
    `<a class="file" href="${REPO_URL}/blob/${esc(r.sha)}/${path.split("/").map(encodeURIComponent).join("/")}" target="_blank" rel="noopener"><code>${esc(path)}</code></a>`;
  const stat = (n: number | string, label: string) => `<div class="stat"><span class="n">${n}</span><span class="l">${label}</span></div>`;
  const fields = (f: Record<string, string>, skip: string[] = []) => {
    const keys = Object.keys(f).filter((k) => !skip.includes(k));
    return keys.length ? `<dl class="fields">${keys.map((k) => `<dt>${esc(k)}</dt><dd>${inline(f[k])}</dd>`).join("")}</dl>` : "";
  };

  const entry = (e: Entry, id: string, extra = "") =>
    `<article class="entry" id="${id}"><h3>${inline(e.title)}${extra}</h3>${fields(e.fields)}${blocks(e.blocks)}</article>`;

  const renderSection = (s: Section) => {
    const id = anchor(s.name);
    const name = s.name.toLowerCase();
    let body: string;
    if (name.startsWith("principles")) {
      body = `${blocks(s.blocks)}<div class="cards">${s.entries
        .map((e, i) => `<article class="card" id="p-${i + 1}"><h3>${inline(e.title)}</h3>${blocks(e.blocks)}${fields(e.fields)}</article>`)
        .join("")}</div>`;
    } else if (name.startsWith("decision records")) {
      const counts = new Map<string, number>();
      for (const d of a.decisions) {
        const st = (d.fields.Status ?? "").split(/\s/)[0];
        counts.set(st, (counts.get(st) ?? 0) + 1);
      }
      body = `${blocks(s.blocks)}<p class="note">${[...counts].map(([k, n]) => `${n} ${k.toLowerCase()}`).join(" · ")}</p><div class="entries">${a.decisions
        .map(
          (d) => `<article class="entry adr" id="${d.id.toLowerCase()}"><h3><span class="code">${esc(d.id)}</span>${inline(d.title)}</h3><p>${statusPill(d.fields.Status ?? "")} <span class="note">Decided ${inline(d.fields.Decided ?? "")}</span></p>${fields(
            d.fields,
            ["Status", "Decided"]
          )}${blocks(d.blocks)}</article>`
        )
        .join("\n")}</div>`;
    } else if (name.startsWith("risks")) {
      body = `${blocks(s.blocks)}<div class="entries">${s.entries.map((e, i) => entry(e, `risk-${i + 1}`)).join("\n")}</div>`;
    } else {
      body = `<div class="prose">${blocks(s.blocks)}</div>${s.entries.length ? `<div class="entries">${s.entries.map((e) => entry(e, `${id}-${anchor(e.title)}`)).join("\n")}</div>` : ""}`;
    }
    return `<section id="${id}"><h2>${esc(s.name)}</h2>\n${body}\n</section>`;
  };

  const written = a.doc.sections.filter((s) => !s.name.toLowerCase().startsWith("change log"));
  const scopeCell = (scope: string[]) =>
    scope.length ? scope.map((x) => `<code>${esc(x)}</code>`).join(" ") : `<span class="badge warn" title="Any query here runs as the table owner">none declared</span>`;
  const sessionCell = (s: string) => `<span class="badge${s === "public" ? "" : s === "own check" ? " plan" : " ok"}" title="${esc(SESSION_HELP[s])}">${esc(s)}</span>`;
  const unscoped = inv.apis.filter((x) => x.scope.length === 0 && x.session !== "public");

  const inventory = `<section id="inventory"><h2>Inventory</h2>
<p class="note">Read from the code at ${commit(r.sha)} each time this page is built, so it cannot fall behind. The document above has to name every dependency, environment variable, scheduled job, CI job, API group and library module listed here, or CI fails.</p>
<h3 id="inv-coverage">What the document covers</h3>
<ul class="health">${report.coverage
    .map(
      (c) => `<li class="${c.missing.length ? "warn" : "ok"}"><span class="mark" aria-hidden="true">${c.missing.length ? "!" : "✓"}</span><div><p><b>${esc(c.label)}</b></p><p class="detail">${c.named} of ${c.total} named${
        c.missing.length ? `; missing ${c.missing.map((m) => `<code>${esc(m)}</code>`).join(", ")}` : ""
      }</p></div></li>`
    )
    .join("")}</ul>

<h3 id="inv-api">API routes (${inv.apis.length})</h3>
<p class="note">${inline(
    `Session: who may call it. Scope: the household wrapper the route enters, which decides whether its queries run as \`app_user\` under row-level security. ` +
      (unscoped.length ? `${unscoped.length} signed-in routes declare none, so their queries run as the table owner with only their own filters (#33).` : "Every signed-in route declares one.")
  )}</p>
<div class="scroll"><table class="plain"><thead><tr><th scope="col">Route</th><th scope="col">Methods</th><th scope="col">Session</th><th scope="col">Scope</th></tr></thead><tbody>${inv.apis
    .map((x) => `<tr><td class="nowrap">${fileLink(x.file, x.path)}</td><td class="nowrap">${x.methods.map((m) => `<code>${m}</code>`).join(" ")}</td><td>${sessionCell(x.session)}</td><td>${scopeCell(x.scope)}</td></tr>`)
    .join("")}</tbody></table></div>

<h3 id="inv-pages">Pages (${inv.pages.length})</h3>
<div class="scroll"><table class="plain"><thead><tr><th scope="col">Page</th><th scope="col">Session</th><th scope="col">Scope</th></tr></thead><tbody>${inv.pages
    .map((x) => `<tr><td class="nowrap">${fileLink(x.file, x.path)}</td><td>${sessionCell(x.session)}</td><td>${x.scope.length ? x.scope.map((s) => `<code>${s}</code>`).join(" ") : `<span class="none">no data read</span>`}</td></tr>`)
    .join("")}</tbody></table></div>

<h3 id="inv-actions">Server actions (${inv.actions.reduce((n, x) => n + x.exports.length, 0)} in ${inv.actions.length} modules)</h3>
<div class="scroll"><table class="plain"><thead><tr><th scope="col">Module</th><th scope="col">Actions</th></tr></thead><tbody>${inv.actions
    .map((x) => `<tr><td class="nowrap">${fileAt(x.file)}</td><td>${x.exports.map((e) => `<code>${esc(e)}</code>`).join(" ")}</td></tr>`)
    .join("")}</tbody></table></div>

<h3 id="inv-jobs">Scheduled jobs (${inv.crons.length})</h3>
<div class="scroll"><table class="plain"><thead><tr><th scope="col">Path</th><th scope="col">Schedule</th><th scope="col">When</th></tr></thead><tbody>${inv.crons
    .map((c) => `<tr><td><code>${esc(c.path)}</code></td><td><code>${esc(c.schedule)}</code></td><td>${esc(describeCron(c.schedule))}</td></tr>`)
    .join("")}</tbody></table></div>

<h3 id="inv-ci">CI (${inv.ciJobs.length} jobs, ${inv.ciJobs.reduce((n, j) => n + j.steps.length, 0)} commands)</h3>
<div class="cards">${inv.ciJobs
    .map((j) => `<article class="card"><h3>${esc(j.name)}</h3><span class="count">${j.steps.length} commands, in order</span><ol class="desc">${j.steps.map((st) => `<li><code>${esc(st)}</code></li>`).join("")}</ol></article>`)
    .join("")}</div>

<h3 id="inv-deps">Runtime dependencies (${inv.dependencies.length})</h3>
<div class="tags">${inv.dependencies.map((d) => `<span class="tag">${esc(d.name)} <span class="note">${esc(d.version)}</span></span>`).join("")}</div>

<h3 id="inv-env">Environment variables (${inv.envVars.length})</h3>
<p class="note">Names only, with the files that read them. Values live in Vercel and in each developer's <code>.env.local</code>, never here.</p>
<div class="scroll"><table class="plain"><thead><tr><th scope="col">Name</th><th scope="col">Read in</th></tr></thead><tbody>${inv.envVars
    .map((e) => `<tr><td class="nowrap"><code>${esc(e.name)}</code></td><td class="src">${e.files.map((f) => fileAt(f)).join(" ")}</td></tr>`)
    .join("")}</tbody></table></div>

<h3 id="inv-lib">Library modules (${inv.libModules.length})</h3>
<div class="tags">${inv.libModules.map((m) => `<code class="tag">src/lib/${esc(m)}</code>`).join("")}</div>
<p class="note">Database: ${inv.tables} tables and ${inv.migrations} migrations, described in the data model.</p>
</section>`;

  function fileLink(file: string, label: string) {
    return `<a class="file" href="${REPO_URL}/blob/${esc(r.sha)}/${file.split("/").map(encodeURIComponent).join("/")}" target="_blank" rel="noopener"><code>${esc(label)}</code></a>`;
  }

  const toc = [...written.map((s) => [anchor(s.name), s.name]), ["inventory", "Inventory"], ["log", "Change log"]]
    .map(([id, name]) => `<li><a href="#${id}">${esc(name)}</a></li>`)
    .join("");

  const accepted = a.decisions.filter((d) => (d.fields.Status ?? "").startsWith("Accepted")).length;
  const intro = a.doc.intro.length ? blocks(a.doc.intro, "lede") : "";

  return `<title>RetireWise Technical Architecture</title>
${FONTS}
<style>${BASE_CSS}${DOC_CSS}${ARCH_CSS}</style>
<div class="page">
<header class="hero">
  <p class="eyebrow">RetireWise · Technical architecture</p>
  <h1>Technical architecture</h1>
  <p class="meta">${r.preview ? `<b>Preview, not released.</b> Built from ${commit(r.sha)}` : `As live in production at ${commit(r.sha)}`} · ${esc(r.date)} · last reviewed ${esc(a.doc.lastReviewed)}</p>
  ${intro}
  <div class="stats">${stat(inv.pages.length, "pages")}${stat(inv.apis.length, "API routes")}${stat(inv.actions.reduce((n, x) => n + x.exports.length, 0), "server actions")}${stat(inv.crons.length, "scheduled jobs")}${stat(inv.dependencies.length, "runtime dependencies")}${stat(accepted, "decisions in force")}${stat(a.risks.length, "open risks")}</div>
  <div class="release" role="status"><p class="eyebrow">This release</p>${
    r.firstPublication
      ? `<p class="note">First publication of this document.</p>`
      : r.changes.length
        ? `<ul class="changes">${r.changes.map((x) => `<li>${inline(x)}</li>`).join("")}</ul>`
        : `<p class="note">The architecture did not change since ${r.previousSha ? commit(r.previousSha) : "the last release"}.</p>`
  }</div>
  ${report.errors.length ? `<div class="problems" role="alert"><p><b>${report.errors.length} problem${report.errors.length === 1 ? "" : "s"} between the document and the code at this commit.</b> <code>pnpm arch:check</code> names them.</p><ul>${report.errors.slice(0, 8).map((e) => `<li>${inline(e)}</li>`).join("")}</ul></div>` : ""}
  <p class="source">Written in ${fileAt(DOC_FILE)}; the inventory is read from the code. Both at ${commit(r.sha)}. The database is described in the RetireWise Data Model page.</p>
</header>
<div class="layout">
<nav class="toc" aria-label="Contents"><p class="eyebrow">Contents</p><ol>${toc}</ol></nav>
<main>
${written.map(renderSection).join("\n\n")}

${inventory}

<section id="log"><h2>Change log</h2>
<div class="scroll"><table class="plain"><thead><tr><th scope="col">Date</th><th scope="col">Change</th><th scope="col">By</th></tr></thead>
<tbody>${[...a.log].reverse().map((l) => `<tr><td class="id">${esc(l.date)}</td><td>${inline(l.change)}</td><td class="src">${esc(l.by)}</td></tr>`).join("\n")}</tbody></table></div>
</section>
</main>
</div>
<p class="foot">${r.preview ? "A preview for review. The published page is built only after a successful <code>pnpm deploy:prod</code>, so it describes what is live." : "Published after a successful <code>pnpm deploy:prod</code>, so this page describes what is live."} Built by <code>scripts/build-architecture.ts</code>, which also fails CI when the document stops covering the code: <code>pnpm arch:check</code>.</p>
</div>
`;
}

const ARCH_CSS = `
.entry.adr h3 .code { order: -1; }
.entry.adr > p { display: flex; flex-wrap: wrap; gap: 8px; align-items: baseline; }
#inventory h3 { padding-top: 8px; }
.card ol.desc { margin: 0; padding-left: 1.4em; display: grid; gap: 3px; font-size: 0.84rem; }
`;
