/**
 * The data model page: the catalog read from the schema and migrations, laid
 * beside what docs/DATA-MODEL.md says each part is for.
 *
 * Diagrams are Mermaid, drawn from the catalog on every build, so a new table
 * or foreign key appears in them without anyone redrawing anything.
 */
import { anchor, esc, makeInline, REPO_URL } from "../pages/inline";
import { renderBlocks, type Block } from "../pages/markdown";
import { BASE_CSS, DOC_CSS, FONTS } from "../pages/theme";
import { DOC_FILE, MIGRATIONS_DIR, SCHEMA_FILE, type Catalog, type Column, type ModelDoc, type ModelReport, type TableInfo } from "./model";

export type ModelRelease = {
  sha: string;
  date: string;
  previousSha?: string;
  firstPublication: boolean;
  /** Change-log lines added since the release this one replaced. */
  changes: string[];
  preview?: boolean;
};

const tableId = (name: string) => `t-${name}`;
const enumId = (name: string) => `e-${name}`;

/** Mermaid identifiers and types: letters, digits and underscores only. */
function mermaidType(type: string): string {
  const t = type.toLowerCase();
  if (t.startsWith("timestamp")) return t.includes("with time zone") ? "timestamptz" : "timestamp";
  if (t.startsWith("numeric")) return "numeric";
  if (t.endsWith("[]")) return `${mermaidType(t.slice(0, -2))}_list`;
  return t.replace(/\(.*\)/, "").trim().replace(/[^a-z0-9_]+/g, "_") || "value";
}

const ownership = (t: TableInfo) =>
  t.householdKey ? "household" : t.grants.length === 0 ? "system" : t.grants.every((g) => g === "SELECT") ? "reference" : "shared";

/** Break a title into lines of at most max characters, at spaces. */
function wrap(text: string, max: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(" ")) {
    if (line && (line + " " + word).length > max) { lines.push(line); line = word; }
    else line = line ? `${line} ${word}` : word;
  }
  if (line) lines.push(line);
  return lines;
}

/**
 * The whole catalog on one screen: a box per domain listing its tables, each
 * marked by who can reach it. Drawn as SVG from the catalog, coloured by the
 * page's own tokens, so it reads in both themes and redraws itself.
 */
function domainMap(m: ModelDoc, c: Catalog): string {
  const byName = new Map(c.tables.map((t) => [t.name, t]));
  const W = 960, pad = 12, gap = 16, cols = 4, line = 18;
  const boxW = (W - 2 * pad - (cols - 1) * gap) / cols;
  const boxes = m.domains.map((d) => {
    const title = wrap(d.name, 27);
    const tables = d.tables.map((n) => byName.get(n)).filter((t): t is TableInfo => Boolean(t));
    const fks = tables.reduce((n, t) => n + t.columns.filter((x) => x.references && d.tables.includes(x.references.table)).length, 0);
    return { d, title, tables, fks, h: 16 + title.length * line + 10 + tables.length * line + 30 };
  });
  const rows: (typeof boxes)[] = [];
  for (let i = 0; i < boxes.length; i += cols) rows.push(boxes.slice(i, i + cols));
  const glyph = (kind: string, x: number, y: number) =>
    kind === "reference"
      ? `<path d="M${x},${y - 5} L${x + 5},${y} L${x},${y + 5} L${x - 5},${y} z" class="g-reference"/>`
      : kind === "system"
        ? `<rect x="${x - 4}" y="${y - 4}" width="8" height="8" class="g-system"/>`
        : kind === "household"
          ? `<circle cx="${x}" cy="${y}" r="4.5" class="g-household"/>`
          : `<circle cx="${x}" cy="${y}" r="4.5" class="g-shared"/>`;
  let y = pad;
  const parts: string[] = [];
  for (const row of rows) {
    const h = Math.max(...row.map((b) => b.h));
    row.forEach((b, i) => {
      const x = pad + i * (boxW + gap);
      const tx = x + 14;
      let ty = y + 16 + 13;
      const title = b.title.map((l, k) => `<text x="${tx}" y="${ty + k * line}" class="t">${esc(l)}</text>`).join("");
      ty += b.title.length * line + 8;
      const names = b.tables
        .map((t, k) => `${glyph(ownership(t), tx + 4, ty + k * line - 4)}<text x="${tx + 16}" y="${ty + k * line}" class="s map-t">${esc(t.name)}</text>`)
        .join("");
      const foot = `${b.tables.length} table${b.tables.length === 1 ? "" : "s"}${b.fks ? ` · ${b.fks} foreign key${b.fks === 1 ? "" : "s"}` : ""}`;
      parts.push(
        `<a href="#d-${anchor(b.d.name)}"><rect x="${x}" y="${y}" width="${boxW}" height="${h}" rx="6" class="nd"/>${title}${names}<text x="${tx}" y="${y + h - 12}" class="el">${esc(foot)}</text></a>`
      );
    });
    y += h + gap;
  }
  const H = y - gap + pad;
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(
    `The ${c.tables.length} tables in ${m.domains.length} domains: ` + m.domains.map((d) => `${d.name} (${d.tables.join(", ")})`).join("; ")
  )}">${parts.join("")}</svg>`;
}

/** One domain as an entity-relationship diagram, keys only. */
function domainDiagram(tables: string[], c: Catalog): string {
  const byName = new Map(c.tables.map((t) => [t.name, t]));
  const lines = ["erDiagram"];
  const rels: string[] = [];
  for (const name of tables) {
    const t = byName.get(name);
    if (!t) continue;
    const keys = t.columns.filter((col) => col.primary || col.references || col.unique || col.name === t.householdKey);
    lines.push(`  ${name} {`);
    for (const col of keys) {
      const k = [col.primary && "PK", col.references && "FK", col.unique && !col.primary && "UK"].filter(Boolean).join(",");
      const note = col.name === t.householdKey && !col.references ? ' "household key"' : "";
      lines.push(`    ${mermaidType(col.type)} ${col.name}${k ? ` ${k}` : ""}${note}`);
    }
    lines.push("  }");
    for (const col of t.columns) {
      if (!col.references) continue;
      rels.push(`  ${col.references.table} ${col.notNull ? "||" : "|o"}--o{ ${name} : "${col.name}"`);
    }
  }
  // Tables in this domain that point at each other, or at another domain's.
  for (const t of c.tables) {
    if (tables.includes(t.name)) continue;
    for (const col of t.columns) {
      if (col.references && tables.includes(col.references.table)) rels.push(`  ${col.references.table} ${col.notNull ? "||" : "|o"}--o{ ${t.name} : "${col.name}"`);
    }
  }
  return [...lines, ...rels].join("\n");
}

const mermaid = (src: string) => `<div class="mermaid-wrap"><pre class="mermaid">${esc(src)}</pre></div>`;

export function renderModelPage(m: ModelDoc, c: Catalog, report: ModelReport, r: ModelRelease): string {
  const local = new Map<string, string>([
    ...c.tables.map((t) => [t.name, tableId(t.name)] as [string, string]),
    ...c.enums.map((e) => [e.name, enumId(e.name)] as [string, string]),
  ]);
  const inline = makeInline(r.sha, local);
  const blocks = (bs: Block[], cls = "") => renderBlocks(bs, inline, cls);
  const commit = (sha: string) =>
    `<a href="${REPO_URL}/commit/${esc(sha)}" target="_blank" rel="noopener"><code>${esc(sha.slice(0, 7))}</code></a>`;
  const fileAt = (path: string) =>
    `<a class="file" href="${REPO_URL}/blob/${esc(r.sha)}/${esc(path)}" target="_blank" rel="noopener"><code>${esc(path)}</code></a>`;
  const stat = (n: number | string, label: string) => `<div class="stat"><span class="n">${n}</span><span class="l">${label}</span></div>`;
  const fields = (f: Record<string, string>) => {
    const keys = Object.keys(f);
    return keys.length ? `<dl class="fields">${keys.map((k) => `<dt>${esc(k)}</dt><dd>${inline(f[k])}</dd>`).join("")}</dl>` : "";
  };

  const byName = new Map(c.tables.map((t) => [t.name, t]));
  const docs = new Map(m.tables.map((t) => [t.name, t]));
  const domainOf = new Map(m.domains.flatMap((d) => d.tables.map((t) => [t, d.name] as [string, string])));
  const enumUse = new Map(c.enums.map((e) => [e.name, [] as string[]]));
  for (const t of c.tables) for (const col of t.columns) enumUse.get(col.type)?.push(`${t.name}.${col.name}`);
  const fkCount = c.tables.reduce((n, t) => n + t.columns.filter((x) => x.references).length, 0);
  const columnCount = c.tables.reduce((n, t) => n + t.columns.length, 0);
  const policyCount = c.tables.reduce((n, t) => n + t.policies.length, 0);
  const rlsOn = c.tables.filter((t) => t.rls).length;

  const keyChips = (t: TableInfo, col: Column) =>
    [
      col.primary && `<span class="k pk" title="Primary key">PK</span>`,
      col.references && `<span class="k fk" title="Foreign key">FK</span>`,
      col.unique && !col.primary && `<span class="k uq" title="Unique">UQ</span>`,
      col.name === t.householdKey && `<span class="k hk" title="Ties the row to a household; row-level security filters on it">HH</span>`,
    ]
      .filter(Boolean)
      .join("");

  const tableCard = (t: TableInfo) => {
    const d = docs.get(t.name);
    const notes = new Map((d?.columnNotes ?? []).map((n) => [n.column, n.note]));
    const kind = ownership(t);
    const badges = [
      `<span class="badge">${esc(domainOf.get(t.name) ?? "No domain")}</span>`,
      t.rls ? `<span class="badge ok">RLS on</span>` : `<span class="badge bad">RLS off</span>`,
      kind === "household" ? `<span class="badge key">Household data · ${esc(t.householdKey!)}</span>` : "",
      kind === "reference" ? `<span class="badge plan">Reference data · read-only</span>` : "",
      kind === "system" ? `<span class="badge warn">System only · no request access</span>` : "",
      kind === "shared" ? `<span class="badge">Shared</span>` : "",
      `<span class="note">${t.columns.length} columns</span>`,
    ].join("");
    const cols = t.columns
      .map(
        (col) => `<tr><td class="cname"><code>${esc(col.name)}</code>${keyChips(t, col)}</td><td class="ctype">${
          enumUse.has(col.type) ? `<a class="ref" href="#${enumId(col.type)}"><code>${esc(col.type)}</code></a>` : `<code>${esc(col.type)}</code>`
        }</td><td class="nowrap">${col.notNull ? "not null" : `<span class="none">null</span>`}</td><td class="cdef">${col.default ? `<code>${esc(col.default)}</code>` : ""}</td><td class="cref">${
          col.references
            ? `<a class="ref" href="#${tableId(col.references.table)}">${esc(col.references.table)}</a>${col.references.onDelete ? `<div class="sub">on delete ${esc(col.references.onDelete)}</div>` : ""}`
            : ""
        }</td><td class="cnote">${notes.has(col.name) ? inline(notes.get(col.name)!) : ""}</td></tr>`
      )
      .join("");
    const policies = t.policies.length
      ? `<details><summary>Row-level security policies (${t.policies.length})</summary><div class="scroll"><table class="plain"><thead><tr><th>Policy</th><th>For</th><th>Role</th><th>Using</th><th>With check</th></tr></thead><tbody>${t.policies
          .map((p) => `<tr><td class="nowrap"><code>${esc(p.name)}</code></td><td class="nowrap">${esc(p.command)}</td><td>${esc(p.role)}</td><td>${p.using ? `<code>${esc(p.using)}</code>` : ""}</td><td>${p.check ? `<code>${esc(p.check)}</code>` : ""}</td></tr>`)
          .join("")}</tbody></table></div></details>`
      : `<p class="note">No row-level security policy: ${t.grants.length ? "the request role is granted access but RLS admits no rows." : "only the system role reads or writes it."}</p>`;
    const grants = `<p class="note">Request role (<code>app_user</code>) may: ${t.grants.length ? t.grants.map((g) => `<code>${g}</code>`).join(" ") : "nothing"}.</p>`;
    const indexes = t.indexes.length
      ? `<details><summary>Indexes and unique constraints (${t.indexes.length})</summary><ul class="desc">${t.indexes
          .map((i) => `<li><code>${esc(i.name)}</code> ${i.unique ? "unique on" : "on"} (${i.columns.map((x) => `<code>${esc(x)}</code>`).join(", ")})</li>`)
          .join("")}</ul></details>`
      : "";
    return `<article class="tcard" id="${tableId(t.name)}" data-search="${esc([t.name, domainOf.get(t.name) ?? "", ...t.columns.map((x) => x.name)].join(" ").toLowerCase())}">
<header class="thead"><h3><code>${esc(t.name)}</code></h3>${badges}</header>
${d ? blocks(d.description) : `<p class="note">Not yet described in <code>${DOC_FILE}</code>.</p>`}
${d ? fields(d.entry.fields) : ""}
<div class="scroll"><table class="cols"><thead><tr><th scope="col">Column</th><th scope="col">Type</th><th scope="col">Null</th><th scope="col">Default</th><th scope="col">References</th><th scope="col">Note</th></tr></thead><tbody>${cols}</tbody></table></div>
${grants}
${policies}
${indexes}
</article>`;
  };

  const domainSections = m.domains
    .map(
      (d) => `<h3 class="dhead" id="tables-${anchor(d.name)}">${esc(d.name)}</h3>\n${d.tables
        .map((n) => byName.get(n))
        .filter((t): t is TableInfo => Boolean(t))
        .map(tableCard)
        .join("\n")}`
    )
    .join("\n");

  const domainCards = m.domains
    .map(
      (d) => `<article class="card" id="d-${anchor(d.name)}"><h3>${esc(d.name)}</h3><span class="count">${d.tables.length} table${d.tables.length === 1 ? "" : "s"}</span>${blocks(d.description)}<div class="tags">${d.tables
        .map((t) => `<a class="tag" href="#${tableId(t)}">${esc(t)}</a>`)
        .join("")}</div></article>`
    )
    .join("\n");

  const domainDiagrams = m.domains
    .map(
      (d) => `<figure class="diagram"><figcaption><b>${esc(d.name)}</b>: keys and foreign keys. Every column is in the table cards below.</figcaption>${mermaid(domainDiagram(d.tables, c))}</figure>`
    )
    .join("\n");

  const enumDocs = new Map(m.enums.map((e) => [e.name, e]));
  const enumRows = c.enums
    .map((e) => {
      const d = enumDocs.get(e.name);
      const notes = new Map((d?.valueNotes ?? []).map((n) => [n.column, n.note]));
      return `<tr id="${enumId(e.name)}"><td class="id">${esc(e.name)}</td><td>${d ? blocks(d.description) : ""}${
        notes.size ? `<ul class="desc">${[...notes].map(([v, n]) => `<li><code>${esc(v)}</code>: ${inline(n)}</li>`).join("")}</ul>` : ""
      }</td><td><div class="tags">${e.values.map((v) => `<code>${esc(v)}</code>`).join("")}</div></td><td class="src">${(enumUse.get(e.name) ?? [])
        .map((u) => `<a class="ref" href="#${tableId(u.split(".")[0])}">${esc(u)}</a>`)
        .join("<br>") || `<span class="none">unused</span>`}</td></tr>`;
    })
    .join("\n");

  const entryCards = (es: ModelDoc["rules"], prefix: string) =>
    es.length
      ? `<div class="entries">${es
          .map((e) => `<article class="entry" id="${prefix}-${anchor(e.title)}"><h3>${inline(e.title)}</h3>${fields(e.fields)}${blocks(e.blocks)}</article>`)
          .join("\n")}</div>`
      : `<p class="note">None written yet.</p>`;

  const sec = (prefix: string) => m.doc.sections.find((s) => s.name.toLowerCase().startsWith(prefix));
  const security = sec("security");
  const verification = sec("verification");
  const health = report.health
    .map((h) => {
      const cls = h.info ? "info" : h.ok ? "ok" : "warn";
      return `<li class="${cls}"><span class="mark" aria-hidden="true">${cls === "ok" ? "✓" : cls === "warn" ? "!" : "i"}</span><div><p><b>${esc(h.label)}</b></p><p class="detail">${inline(h.detail)}</p></div></li>`;
    })
    .join("\n");

  return `<title>RetireWise Data Model</title>
${FONTS}
<style>${BASE_CSS}${DOC_CSS}</style>
<div class="page">
<header class="hero">
  <p class="eyebrow">RetireWise · Data model</p>
  <h1>Data model</h1>
  <p class="meta">${r.preview ? `<b>Preview, not released.</b> Built from ${commit(r.sha)}` : `As live in production at ${commit(r.sha)}`} · ${esc(r.date)} · last reviewed ${esc(m.doc.lastReviewed)}</p>
  ${blocks(m.doc.intro, "lede")}
  <div class="stats">${stat(c.tables.length, "tables")}${stat(columnCount, "columns")}${stat(fkCount, "foreign keys")}${stat(c.enums.length, "enums")}${stat(`${rlsOn}<small>/${c.tables.length}</small>`, "tables with RLS on")}${stat(policyCount, "RLS policies")}${stat(m.domains.length, "domains")}</div>
  <div class="release" role="status"><p class="eyebrow">This release</p>${
    r.firstPublication
      ? `<p class="note">First publication of this document.</p>`
      : r.changes.length
        ? `<ul class="changes">${r.changes.map((x) => `<li>${inline(x)}</li>`).join("")}</ul>`
        : `<p class="note">The data model did not change since ${r.previousSha ? commit(r.previousSha) : "the last release"}.</p>`
  }</div>
  ${report.errors.length ? `<div class="problems" role="alert"><p><b>${report.errors.length} problem${report.errors.length === 1 ? "" : "s"} between the document and the schema at this commit.</b> <code>pnpm datamodel:check</code> names them.</p><ul>${report.errors.slice(0, 8).map((e) => `<li>${inline(e)}</li>`).join("")}</ul></div>` : ""}
  <p class="source">Tables, columns, keys and enums are read from ${fileAt(SCHEMA_FILE)}; row-level security, policies and grants from ${fileAt(MIGRATIONS_DIR)}. What each one is for is written in ${fileAt(DOC_FILE)}. All at ${commit(r.sha)}.</p>
</header>
<div class="layout">
<nav class="toc" aria-label="Contents"><p class="eyebrow">Contents</p><ol>
  <li><a href="#picture">The catalog in one picture</a></li>
  <li><a href="#domains">Domains</a></li>
  <li><a href="#tables">Tables</a></li>
  <li><a href="#enums">Enums</a></li>
  <li><a href="#rules">Business rules</a></li>
  <li><a href="#derived">Derived data</a></li>
  <li><a href="#security">Security model</a></li>
  <li><a href="#health">Catalog health</a></li>
  <li><a href="#verification">Verification</a></li>
  <li><a href="#log">Change log</a></li>
</ol></nav>
<main>
<section id="picture"><h2>The catalog in one picture</h2>
<figure class="model">
  <div class="model-scroll">${domainMap(m, c)}</div>
  <p class="legend"><span><svg viewBox="-6 -6 12 12" aria-hidden="true"><circle r="4.5" class="g-household"/></svg>A household's own data, behind row-level security</span><span><svg viewBox="-6 -6 12 12" aria-hidden="true"><path d="M0,-5 L5,0 L0,5 L-5,0 z" class="g-reference"/></svg>Reference data: every household reads it, none writes it</span><span><svg viewBox="-6 -6 12 12" aria-hidden="true"><rect x="-4" y="-4" width="8" height="8" class="g-system"/></svg>System records no request can reach</span></p>
  <figcaption>Every table, by domain; select a domain to read about it. Most tables are tied to a household by <code>clerk_id</code>, the primary member's id, rather than by a foreign key, and row-level security filters on that key.</figcaption>
</figure>
${(() => {
  const cross = c.tables.flatMap((t) => t.columns.filter((x) => x.references && domainOf.get(t.name) !== domainOf.get(x.references.table)).map((x) => `\`${t.name}.${x.name}\` → \`${x.references!.table}\``));
  return cross.length ? `<p class="note">Foreign keys between domains: ${inline(cross.join(", "))}. Those inside a domain are drawn in its diagram under Domains.</p>` : "";
})()}
</section>

<section id="domains"><h2>Domains</h2>
${blocks(sec("domains")?.blocks ?? [], "")}
<div class="cards">${domainCards}</div>
${domainDiagrams}
</section>

<section id="tables"><h2>Tables</h2>
<p class="note">One card per table. Column, type, nullability, default and references come from the schema; descriptions and notes from the document. <span class="k pk">PK</span> primary key, <span class="k fk">FK</span> foreign key, <span class="k uq">UQ</span> unique, <span class="k hk">HH</span> the column that ties a row to a household.</p>
<div class="filterbar" role="search"><label for="q" class="sr">Filter tables</label><input id="q" type="search" placeholder="Filter: a table or column name…" autocomplete="off"><p id="count" class="note" aria-live="polite"></p></div>
${domainSections}
</section>

<section id="enums"><h2>Enums</h2>
<p class="note">Postgres enums: the column can hold only these values, so adding one is a migration.</p>
<div class="scroll"><table class="plain"><thead><tr><th scope="col">Enum</th><th scope="col">Meaning</th><th scope="col">Values</th><th scope="col">Used by</th></tr></thead><tbody>${enumRows}</tbody></table></div>
</section>

<section id="rules"><h2>Business rules</h2>
${blocks(sec("business rules")?.blocks ?? [])}
${entryCards(m.rules, "r")}
</section>

<section id="derived"><h2>Derived data</h2>
${blocks(sec("derived data")?.blocks ?? [])}
${entryCards(m.derived, "dd")}
</section>

<section id="security"><h2>Security model</h2>
<div class="prose">${blocks(security?.blocks ?? [])}</div>
${security?.entries.length ? entryCards(security.entries, "s") : ""}
</section>

<section id="health"><h2>Catalog health</h2>
<p class="note">Computed from the schema and migrations on every build. A household table without row-level security fails the build outright.</p>
<ul class="health">${health}</ul>
</section>

<section id="verification"><h2>Verification</h2>
<div class="prose">${blocks(verification?.blocks ?? [])}</div>
${verification?.entries.length ? entryCards(verification.entries, "v") : ""}
</section>

<section id="log"><h2>Change log</h2>
<div class="scroll"><table class="plain"><thead><tr><th scope="col">Date</th><th scope="col">Change</th><th scope="col">By</th></tr></thead>
<tbody>${[...m.log].reverse().map((l) => `<tr><td class="id">${esc(l.date)}</td><td>${inline(l.change)}</td><td class="src">${esc(l.by)}</td></tr>`).join("\n")}</tbody></table></div>
</section>
</main>
</div>
<p class="foot">${r.preview ? "A preview for review. The published page is built only after a successful <code>pnpm deploy:prod</code>, so it describes what is live." : "Published after a successful <code>pnpm deploy:prod</code>, so this page describes what is live."} Built by <code>scripts/build-data-model.ts</code>, which also fails CI when the document and the schema disagree: <code>pnpm datamodel:check</code>.</p>
</div>
<script>${JS}</script>
`;
}

const JS = `
(function () {
  var q = document.getElementById("q");
  var cards = Array.prototype.slice.call(document.querySelectorAll("article.tcard"));
  var heads = Array.prototype.slice.call(document.querySelectorAll("h3.dhead"));
  var count = document.getElementById("count");
  function apply() {
    var term = q.value.trim().toLowerCase();
    var shown = 0;
    cards.forEach(function (c) {
      c.hidden = term !== "" && c.dataset.search.indexOf(term) === -1;
      if (!c.hidden) shown++;
    });
    heads.forEach(function (h) {
      var el = h.nextElementSibling, any = false;
      while (el && el.tagName === "ARTICLE") { if (!el.hidden) any = true; el = el.nextElementSibling; }
      h.hidden = !any;
    });
    count.textContent = shown === cards.length ? "Showing all " + cards.length + " tables" : "Showing " + shown + " of " + cards.length + " tables";
  }
  q.addEventListener("input", apply);
  window.addEventListener("hashchange", function () {
    var t = document.getElementById(location.hash.slice(1));
    if (t && t.hidden) { q.value = ""; apply(); t.scrollIntoView(); }
  });
  apply();
})();
`;
