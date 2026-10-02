/**
 * docs/BACKLOG.md → the RetireWise Backlog page.
 *
 * The markdown file is the backlog; this only reads it. It understands the
 * small, fixed shape the file documents at its top ("### N. Title", a field
 * list, then a description) and nothing more, and validate() refuses an item
 * that strays from it, so a typo fails CI instead of silently dropping a row.
 */

export const OPEN_TYPES = ["Defect", "Gap", "Security", "Tech Debt", "Ops", "Decision", "Verify", "Data"];
const PRIORITIES = ["P1", "P2", "P3"] as const;
const EFFORTS = ["S", "M", "L"] as const;
const SEVERITIES = ["High", "Medium", "Low"] as const;
const FIELD_KEYS = new Set(["Type", "Priority", "Effort", "Severity", "Blocker", "Source", "Closed", "In"]);

type Block = { kind: "p"; text: string } | { kind: "ul"; items: string[] };

export interface Item {
  num: number;
  title: string;
  fields: Record<string, string>;
  body: Block[];
}

export interface Backlog {
  title: string;
  lastReviewed: string;
  intro: Block[];
  open: Item[];
  notes: Block[];
  done: Item[];
}

export interface Release {
  /** The commit now live. */
  sha: string;
  /** The commit that was live before, when known. */
  previousSha?: string;
  date: string;
  /** No backlog existed at the previous commit. */
  firstPublication: boolean;
  /** The new commit is older than the one it replaced. */
  rollback: boolean;
  commits: { sha: string; subject: string }[];
  opened: number[];
  closed: number[];
}

const REPO_URL = "https://github.com/mronan83/RetireWise";

// ── Parsing ──────────────────────────────────────────────────────────────────

function toBlocks(lines: string[]): Block[] {
  const blocks: Block[] = [];
  let buf: string[] = [];
  const flush = () => {
    if (buf.length === 0) return;
    if (buf.every((l) => l.startsWith("- "))) blocks.push({ kind: "ul", items: buf.map((l) => l.slice(2).trim()) });
    else blocks.push({ kind: "p", text: buf.join(" ").trim() });
    buf = [];
  };
  for (const raw of lines) {
    const line = raw.trimEnd();
    if (line.trim() === "") flush();
    else buf.push(line.trim());
  }
  flush();
  return blocks;
}

function toItem(heading: string, lines: string[]): Item {
  const m = heading.match(/^###\s+(\d+)\.\s+(.+)$/);
  if (!m) throw new Error(`Not an item heading: "${heading}" (expected "### N. Title")`);
  const blocks = toBlocks(lines);
  const fields: Record<string, string> = {};
  const first = blocks[0];
  if (first?.kind === "ul" && first.items.every((i) => FIELD_KEYS.has(i.split(":")[0].trim()))) {
    for (const entry of first.items) {
      const at = entry.indexOf(":");
      fields[entry.slice(0, at).trim()] = entry.slice(at + 1).trim();
    }
    blocks.shift();
  }
  return { num: Number(m[1]), title: m[2].trim(), fields, body: blocks };
}

export function parseBacklog(markdown: string): Backlog {
  const text = markdown.replace(/<!--[\s\S]*?-->/g, "");
  const backlog: Backlog = { title: "Backlog", lastReviewed: "", intro: [], open: [], notes: [], done: [] };
  let section: "intro" | "open" | "notes" | "done" | "other" = "intro";
  const introLines: string[] = [];
  const notesLines: string[] = [];
  let itemHead: string | null = null;
  let itemLines: string[] = [];

  const closeItem = () => {
    if (itemHead === null) return;
    const item = toItem(itemHead, itemLines);
    if (section === "open") backlog.open.push(item);
    else if (section === "done") backlog.done.push(item);
    itemHead = null;
    itemLines = [];
  };

  for (const line of text.split("\n")) {
    if (line.startsWith("# ")) {
      backlog.title = line.slice(2).trim();
    } else if (line.startsWith("## ")) {
      closeItem();
      const name = line.slice(3).trim().toLowerCase();
      section = name.startsWith("open") ? "open" : name.startsWith("notes") ? "notes" : name.startsWith("done") ? "done" : "other";
    } else if (line.startsWith("### ")) {
      closeItem();
      if (section === "open" || section === "done") itemHead = line.trim();
    } else if (itemHead !== null) {
      itemLines.push(line);
    } else if (section === "intro") {
      const reviewed = line.match(/^Last reviewed:\s*(.+)$/);
      if (reviewed) backlog.lastReviewed = reviewed[1].trim();
      else introLines.push(line);
    } else if (section === "notes") {
      notesLines.push(line);
    }
  }
  closeItem();
  backlog.intro = toBlocks(introLines);
  backlog.notes = toBlocks(notesLines);
  return backlog;
}

/** Every way an item can be malformed, as sentences. Empty means valid. */
export function validate(b: Backlog): string[] {
  const errors: string[] = [];
  const seen = new Set<number>();
  for (const item of [...b.open, ...b.done]) {
    if (seen.has(item.num)) errors.push(`#${item.num} is used twice.`);
    seen.add(item.num);
  }
  const need = (item: Item, key: string, allowed?: readonly string[]) => {
    const v = item.fields[key];
    if (!v) errors.push(`#${item.num} has no ${key}.`);
    else if (allowed && !allowed.includes(v)) errors.push(`#${item.num} has ${key} "${v}"; expected ${allowed.join(", ")}.`);
  };
  for (const item of b.open) {
    need(item, "Type", OPEN_TYPES);
    need(item, "Priority", PRIORITIES);
    need(item, "Effort", EFFORTS);
    need(item, "Severity", SEVERITIES);
    need(item, "Blocker");
    if (item.body.length === 0) errors.push(`#${item.num} has no description.`);
  }
  for (const item of b.done) {
    need(item, "Type");
    need(item, "In");
    const closed = item.fields.Closed;
    if (!closed || !/^\d{4}-\d{2}-\d{2}$/.test(closed)) errors.push(`#${item.num} needs Closed: YYYY-MM-DD.`);
  }
  const everything = JSON.stringify([b.open, b.done, b.notes]);
  for (const m of everything.matchAll(/(?:^|[\s(–/,"])#(\d+)\b/g)) {
    if (!seen.has(Number(m[1]))) errors.push(`#${m[1]} is referenced but no item has that number.`);
  }
  if (!b.lastReviewed) errors.push(`The file has no "Last reviewed:" line.`);
  return [...new Set(errors)];
}

// ── Rendering ────────────────────────────────────────────────────────────────

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Inline markdown: `code`, **bold**, [text](https://…), and #N item references. */
function inline(s: string, known: Set<number>): string {
  return s
    .split(/(`[^`]+`)/)
    .map((part) => {
      if (part.length > 1 && part.startsWith("`") && part.endsWith("`")) return `<code>${esc(part.slice(1, -1))}</code>`;
      return esc(part)
        .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
        .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
        .replace(/(^|[\s(–/,])#(\d+)\b/g, (whole, pre: string, n: string) =>
          known.has(Number(n)) ? `${pre}<a class="ref" href="#item-${n}">#${n}</a>` : whole
        );
    })
    .join("");
}

function blocks(bs: Block[], known: Set<number>, pClass = ""): string {
  return bs
    .map((b) =>
      b.kind === "p"
        ? `<p${pClass ? ` class="${pClass}"` : ""}>${inline(b.text, known)}</p>`
        : `<ul>${b.items.map((i) => `<li>${inline(i, known)}</li>`).join("")}</ul>`
    )
    .join("");
}

const isReady = (item: Item) => /^none\b/i.test(item.fields.Blocker ?? "");
/** A blocker that starts with "Your" waits on the owner and nobody else. */
const waitsOnYou = (item: Item) => /^your\b/i.test(item.fields.Blocker ?? "");
const PRIORITY_ORDER: Record<string, number> = { P1: 0, P2: 1, P3: 2 };

function waitingOnYou(open: Item[], known: Set<number>): string {
  const mine = open
    .filter(waitsOnYou)
    .sort((a, b) => PRIORITY_ORDER[a.fields.Priority] - PRIORITY_ORDER[b.fields.Priority] || a.num - b.num);
  if (mine.length === 0) {
    return `<section class="yours" aria-labelledby="yours-h"><h2 id="yours-h">Waiting on you</h2><p class="note">Nothing. Every open item is either ready for Claude or waits on another item.</p></section>`;
  }
  const rows = mine
    .map(
      (i) => `<li><span class="pill bp-${i.fields.Priority.toLowerCase()}">${esc(i.fields.Priority)}</span><a class="ref" href="#item-${i.num}">#${i.num}</a><span class="yours-what"><b>${inline(i.fields.Blocker, known)}</b><span class="note">${inline(i.title, known)}</span></span></li>`
    )
    .join("");
  return `<section class="yours" aria-labelledby="yours-h"><h2 id="yours-h">Waiting on you</h2><p class="note">Only you can do these. Everything else on this page is Claude's, or waits on one of these.</p><ol class="yours-list">${rows}</ol></section>`;
}
const short = (sha: string) => sha.slice(0, 7);
const commitLink = (sha: string) =>
  `<a href="${REPO_URL}/commit/${esc(sha)}" target="_blank" rel="noopener"><code>${esc(short(sha))}</code></a>`;
const refs = (nums: number[]) => nums.map((n) => `<a class="ref" href="#item-${n}">#${n}</a>`).join(" ");

function releaseNote(r: Release): string {
  const lines: string[] = [];
  if (r.rollback && r.previousSha) {
    lines.push(`<p>Rolled back from ${commitLink(r.previousSha)} to ${commitLink(r.sha)}.</p>`);
  } else if (r.commits.length > 0 && r.previousSha) {
    const shown = r.commits.slice(0, 8);
    const more = r.commits.length - shown.length;
    lines.push(
      `<p>${r.commits.length} ${r.commits.length === 1 ? "commit" : "commits"} since ${commitLink(r.previousSha)}:</p>` +
        `<ul class="commits">${shown.map((c) => `<li>${commitLink(c.sha)} ${esc(c.subject)}</li>`).join("")}${
          more > 0 ? `<li class="note">and ${more} more</li>` : ""
        }</ul>`
    );
  }
  if (r.firstPublication) lines.push(`<p class="note">First publication of this page.</p>`);
  else if (r.closed.length === 0 && r.opened.length === 0) lines.push(`<p class="note">No backlog items opened or closed.</p>`);
  else {
    if (r.closed.length) lines.push(`<p class="note">Closed ${refs(r.closed)}</p>`);
    if (r.opened.length) lines.push(`<p class="note">Opened ${refs(r.opened)}</p>`);
  }
  return `<div class="release" role="status"><p class="eyebrow">This release</p>${lines.join("")}</div>`;
}

function matrix(open: Item[]): string {
  const cols: [string, string][] = [["S", "hours"], ["M", "about a day"], ["L", "days"]];
  const rows: [string, string][] = [["P1", "next"], ["P2", "this month"], ["P3", "this quarter"]];
  let html = `<div class="mx" role="table" aria-label="Open items by priority and effort"><div class="mx-corner" role="presentation"></div>`;
  html += cols.map(([c, d]) => `<div class="mx-col" role="columnheader"><b>${c}</b> <span>${d}</span></div>`).join("");
  for (const [p, d] of rows) {
    html += `<div class="mx-row-h" role="rowheader"><b>${p}</b> <span>${d}</span></div>`;
    for (const [c] of cols) {
      const here = open.filter((i) => i.fields.Priority === p && i.fields.Effort === c);
      const start = p === "P1" && c === "S";
      html += `<div class="mx-cell${start ? " start" : ""}" role="cell" aria-label="${p}, effort ${c}: ${here.length} ${here.length === 1 ? "item" : "items"}">`;
      if (start) html += `<span class="mx-hint">Start here</span>`;
      html += here.length
        ? here
            .map(
              (i) =>
                `<a class="mx-chip sv-${i.fields.Severity.toLowerCase()}${isReady(i) ? "" : " blocked"}" href="#item-${i.num}" title="#${i.num} ${esc(i.title)} · ${esc(i.fields.Severity)} severity${isReady(i) ? "" : " · blocked"}">${i.num}</a>`
            )
            .join("")
        : `<span class="mx-empty" aria-hidden="true">–</span>`;
      html += `</div>`;
    }
  }
  return `${html}</div>`;
}

export function renderBacklogPage(b: Backlog, r: Release): string {
  const known = new Set([...b.open, ...b.done].map((i) => i.num));
  const ready = b.open.filter(isReady);
  const yours = b.open.filter(waitsOnYou);
  const p1 = b.open.filter((i) => i.fields.Priority === "P1");
  const stat = (n: number, label: string) => `<div class="stat"><span class="n">${n}</span><span class="l">${label}</span></div>`;

  const openRows = b.open
    .map((i) => {
      const source = i.fields.Source ? `<p class="src">Source: ${inline(i.fields.Source, known)}</p>` : "";
      return `<tr id="item-${i.num}" data-item data-num="${i.num}" data-priority="${esc(i.fields.Priority)}" data-ready="${isReady(i)}">
<td class="num">${i.num}</td>
<td class="item"><div class="item-head"><span class="item-name">${inline(i.title, known)}</span> <span class="type">${esc(i.fields.Type)}</span></div>${blocks(i.body, known, "desc")}${source}</td>
<td data-label="Priority"><span class="pill bp-${i.fields.Priority.toLowerCase()}">${esc(i.fields.Priority)}</span></td>
<td data-label="Effort" class="effort">${esc(i.fields.Effort)}</td>
<td data-label="Severity"><span class="pill sv-${i.fields.Severity.toLowerCase()}">${esc(i.fields.Severity)}</span></td>
<td data-label="Blocker" class="blocker${isReady(i) ? " ready" : ""}">${inline(i.fields.Blocker, known)}</td>
</tr>`;
    })
    .join("\n");

  const doneRows = b.done
    .map((i) => {
      const where = /^[0-9a-f]{7,40}$/.test(i.fields.In) ? commitLink(i.fields.In) : inline(i.fields.In, known);
      return `<tr id="item-${i.num}">
<td class="num">${i.num}</td>
<td class="item"><div class="item-head"><span class="item-name">${inline(i.title, known)}</span> <span class="type">${esc(i.fields.Type)}</span></div>${blocks(i.body, known, "desc")}</td>
<td data-label="Closed" class="effort">${esc(i.fields.Closed)}</td>
<td data-label="In" class="blocker">${where}</td>
</tr>`;
    })
    .join("\n");

  return `<title>RetireWise Backlog</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@87..100,500..800&family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:wght@400;500;600;700&display=swap">
<style>${CSS}</style>
<div class="page">
<header class="hero">
  <p class="eyebrow">RetireWise · Backlog</p>
  <h1>Open backlog</h1>
  <p class="meta">As live in production at ${commitLink(r.sha)} · ${esc(r.date)} · last reviewed ${esc(b.lastReviewed)}</p>
  ${blocks(b.intro, known, "lede")}
  <div class="stats">${stat(b.open.length, "open items")}${stat(p1.length, "P1, to do next")}${stat(yours.length, "waiting on you")}${stat(ready.length, "ready for Claude")}${stat(b.open.length - ready.length - yours.length, "parked, or waiting on another item")}${stat(b.done.length, "done")}</div>
  ${releaseNote(r)}
  ${waitingOnYou(b.open, known)}
  <p class="source">Generated from <a href="${REPO_URL}/blob/${esc(r.sha)}/docs/BACKLOG.md" target="_blank" rel="noopener"><code>docs/BACKLOG.md</code></a> as it was at the live commit, where the backlog is edited. Git keeps its history.</p>
</header>
<div class="layout">
<nav class="toc" aria-label="Contents"><p class="eyebrow">Contents</p><ol>
  <li><a href="#priority-and-effort">Priority and effort</a></li>
  <li><a href="#open-items">Open items</a></li>
  <li><a href="#notes-on-sequencing">Notes on sequencing</a></li>
  <li><a href="#done">Done (${b.done.length})</a></li>
  <li><a href="#reading-the-columns">Reading the columns</a></li>
</ol></nav>
<main>
<div class="filterbar" role="search">
  <label for="q" class="sr">Filter items</label>
  <input id="q" type="search" placeholder="Filter items: a number, a word…" autocomplete="off">
  <div class="chips" role="group" aria-label="Show items by priority">${["All", "P1", "P2", "P3", "Ready now"]
    .map((f, n) => `<button type="button" class="chip${n === 0 ? " on" : ""}" data-filter="${f}" aria-pressed="${n === 0}">${f}</button>`)
    .join("")}</div>
  <p id="count" class="note" aria-live="polite"></p>
</div>
<section id="priority-and-effort"><h2>Priority and effort</h2>
<p class="note">Every open item, placed by when to do it and how big it is. Colour is severity; a dashed outline means it waits on something.</p>
<figure class="matrix">${matrix(b.open)}
<figcaption><span class="key"><span class="mx-chip sv-high"></span>High</span><span class="key"><span class="mx-chip sv-medium"></span>Medium</span><span class="key"><span class="mx-chip sv-low"></span>Low</span><span class="key"><span class="mx-chip sv-low blocked"></span>Blocked</span></figcaption>
</figure></section>
<section id="open-items"><h2>Open items</h2>
<p class="note">In number order. Numbers are permanent; a closed item keeps its number in Done.</p>
<div class="table-wrap"><table class="backlog"><thead><tr><th scope="col">#</th><th scope="col">Item</th><th scope="col">Priority</th><th scope="col">Effort</th><th scope="col">Severity</th><th scope="col">Blocker</th></tr></thead>
<tbody>
${openRows}
</tbody></table></div></section>
<section id="notes-on-sequencing"><h2>Notes on sequencing</h2>${blocks(b.notes, known)}</section>
<section id="done"><h2>Done</h2>
<div class="table-wrap"><table class="backlog done"><thead><tr><th scope="col">#</th><th scope="col">Item</th><th scope="col">Closed</th><th scope="col">In</th></tr></thead>
<tbody>
${doneRows}
</tbody></table></div></section>
<section id="reading-the-columns"><h2>Reading the columns</h2>
<dl class="defs">
  <dt>Priority</dt><dd><b>P1</b> next · <b>P2</b> this month · <b>P3</b> this quarter.</dd>
  <dt>Effort</dt><dd><b>S</b> hours · <b>M</b> about a day · <b>L</b> days, often with a decision first.</dd>
  <dt>Severity</dt><dd>What it costs to leave it: <b>High</b> risks data, money or trust; <b>Medium</b> wastes effort or hides a problem; <b>Low</b> is untidy.</dd>
  <dt>Blocker</dt><dd><b>None</b> means Claude can start it now. Anything else names the decision, action or item it waits on.</dd>
</dl></section>
</main>
</div>
<p class="foot">Published after a successful <code>pnpm deploy:prod</code>, never after a merge, so this page describes what is live. Built by <code>scripts/build-backlog.ts</code>.</p>
</div>
<script>${JS}</script>
`;
}

const CSS = `
/* Layout: a contents rail beside one reading column; tables stay inside the column and scroll on their own. */
:root {
  --paper: #F4F6F5; --panel: #FFFFFF; --soft: #E8EDEB; --ink: #15201C; --muted: #56645F; --line: #CBD4D0; --line-strong: #9AA8A2;
  --accent: #0A6A64; --accent-soft: #D9EEEB; --brand: #15201C;
  --good: #2C7738; --good-soft: #DFF0E2; --warn: #8F5B00; --warn-soft: #F6E9CE; --bad: #AE3427; --bad-soft: #F7DFDB; --quiet: #ECEFEE;
  --display: "Archivo", "Helvetica Neue", Arial, sans-serif;
  --body: "IBM Plex Sans", system-ui, -apple-system, "Segoe UI", sans-serif;
  --mono: "IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) {
  --paper: #101614; --panel: #17201D; --soft: #1C2623; --ink: #E3EAE7; --muted: #9AA7A2; --line: #2E3A36; --line-strong: #4F5D58;
  --accent: #45B8AE; --accent-soft: #15332F; --brand: #E3EAE7;
  --good: #62BB6F; --good-soft: #17301B; --warn: #E0A640; --warn-soft: #33280F; --bad: #EC6E60; --bad-soft: #3A1C18; --quiet: #1F2926; color-scheme: dark; } }
:root[data-theme="dark"] {
  --paper: #101614; --panel: #17201D; --soft: #1C2623; --ink: #E3EAE7; --muted: #9AA7A2; --line: #2E3A36; --line-strong: #4F5D58;
  --accent: #45B8AE; --accent-soft: #15332F; --brand: #E3EAE7;
  --good: #62BB6F; --good-soft: #17301B; --warn: #E0A640; --warn-soft: #33280F; --bad: #EC6E60; --bad-soft: #3A1C18; --quiet: #1F2926; color-scheme: dark; }
*, *::before, *::after { box-sizing: border-box; }
body { background: var(--paper); color: var(--ink); font: 400 16px/1.55 var(--body); }
.page { max-width: 1240px; margin: 0 auto; padding-inline: 20px; padding-block: 36px 64px; display: grid; gap: 32px; }
a { color: var(--accent); text-underline-offset: 2px; }
:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; border-radius: 3px; }
code { font-family: var(--mono); font-size: 0.84em; background: var(--soft); padding: 0.05em 0.35em; border-radius: 3px; overflow-wrap: anywhere; }
h1, h2 { font-family: var(--display); font-stretch: 90%; color: var(--brand); text-wrap: balance; margin: 0; letter-spacing: -0.01em; }
h1 { font-size: clamp(1.9rem, 4vw, 2.6rem); font-weight: 750; line-height: 1.08; }
h2 { font-size: 1.45rem; font-weight: 700; line-height: 1.2; padding-top: 6px; }
p { margin: 0; max-width: 72ch; }
.eyebrow { font: 500 0.75rem/1.2 var(--mono); letter-spacing: 0.08em; text-transform: uppercase; color: var(--muted); margin: 0; }
.hero { display: grid; gap: 12px; }
.meta, .source, .note { color: var(--muted); font-size: 0.92rem; }
.lede { font-size: 1.08rem; max-width: 70ch; }
.stats { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 4px; }
.stat { background: var(--panel); border: 1px solid var(--line); border-radius: 8px; padding: 10px 16px; display: grid; min-width: 130px; }
.stat .n { font: 750 1.6rem/1.1 var(--display); color: var(--brand); font-variant-numeric: tabular-nums; }
.stat .l { font-size: 0.85rem; color: var(--muted); }
.yours { background: var(--panel); border: 1px solid var(--line); border-left: 4px solid var(--warn); border-radius: 8px; padding: 14px 16px; gap: 10px; max-width: 80ch; }
.yours h2 { font-size: 1.15rem; padding-top: 0; }
.yours-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 10px; }
.yours-list li { display: grid; grid-template-columns: auto 2.8em minmax(0, 1fr); gap: 4px 10px; align-items: baseline; }
.yours-what { display: grid; gap: 2px; min-width: 0; }
.yours-what b { font-weight: 600; }
.release { background: var(--panel); border: 1px solid var(--line); border-left: 4px solid var(--accent); border-radius: 8px; padding: 12px 16px; display: grid; gap: 6px; max-width: 80ch; }
.release ul.commits { margin: 0; padding-left: 1.1em; display: grid; gap: 2px; font-size: 0.92rem; }
.layout { display: grid; grid-template-columns: 210px minmax(0, 1fr); gap: 32px; align-items: start; }
.toc { position: sticky; top: calc(env(safe-area-inset-top, 0px) + 16px); display: grid; gap: 8px; }
.toc ol { list-style: none; margin: 0; padding: 0; display: grid; gap: 2px; border-left: 2px solid var(--line); }
.toc a { display: block; padding: 3px 0 3px 12px; color: var(--ink); text-decoration: none; font-size: 0.94rem; }
.toc a:hover { color: var(--accent); }
main { display: grid; gap: 28px; min-width: 0; }
section { display: grid; gap: 14px; min-width: 0; scroll-margin-top: 90px; }
section > ul { margin: 0; padding-left: 1.2em; display: grid; gap: 6px; max-width: 76ch; }
.filterbar { position: sticky; top: env(safe-area-inset-top, 0px); z-index: 2; background: var(--paper); padding-block: 10px; border-bottom: 1px solid var(--line); display: flex; flex-wrap: wrap; gap: 8px 12px; align-items: center; }
.filterbar input { flex: 1 1 240px; min-width: 0; font: inherit; font-size: 0.95rem; padding: 8px 12px; border: 1px solid var(--line-strong); border-radius: 6px; background: var(--panel); color: var(--ink); }
.chips { display: flex; flex-wrap: wrap; gap: 6px; }
.chip { font: inherit; font-size: 0.85rem; padding: 5px 11px; border-radius: 999px; border: 1px solid var(--line-strong); background: var(--panel); color: var(--ink); cursor: pointer; }
.chip.on { background: var(--accent); color: var(--paper); border-color: var(--accent); }
#count { flex-basis: 100%; }
.sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
.table-wrap { overflow-x: auto; border: 1px solid var(--line); border-radius: 8px; background: var(--panel); }
table { width: 100%; border-collapse: collapse; font-size: 0.92rem; }
th, td { text-align: left; vertical-align: top; padding: 10px 12px; border-bottom: 1px solid var(--line); }
tr:last-child td { border-bottom: 0; }
th { font: 500 0.72rem/1.2 var(--mono); letter-spacing: 0.07em; text-transform: uppercase; color: var(--muted); background: var(--soft); white-space: nowrap; }
tr:target td { background: var(--warn-soft); }
tr[id] { scroll-margin-top: 120px; }
a.ref { font-family: var(--mono); font-size: 0.86em; text-decoration: none; border-bottom: 1px dotted currentColor; }
.pill { display: inline-block; font-size: 0.76rem; font-weight: 700; padding: 2px 8px; border-radius: 999px; white-space: nowrap; }
.bp-p1 { background: var(--accent); color: var(--paper); }
.bp-p2 { background: var(--accent-soft); color: var(--accent); border: 1px solid var(--accent); }
.bp-p3 { background: transparent; color: var(--muted); border: 1px solid var(--line-strong); }
.sv-high { background: var(--bad-soft); color: var(--bad); }
.sv-medium { background: var(--warn-soft); color: var(--warn); }
.sv-low { background: var(--quiet); color: var(--muted); }
table.backlog td.num { font-family: var(--mono); font-weight: 500; color: var(--accent); white-space: nowrap; font-variant-numeric: tabular-nums; }
table.backlog td.item { min-width: 22rem; }
.item-head { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 8px; }
.item-name { font-weight: 700; }
.type { font: 500 0.7rem/1.2 var(--mono); letter-spacing: 0.06em; text-transform: uppercase; color: var(--muted); }
.desc { color: var(--muted); font-size: 0.9rem; margin-top: 4px; max-width: none; }
.src { font-size: 0.82rem; color: var(--muted); margin-top: 6px; }
td.effort { font-family: var(--mono); font-size: 0.85rem; white-space: nowrap; }
table.backlog td[data-label] { width: 1%; white-space: nowrap; }
table.backlog td.blocker { font-size: 0.88rem; width: 14rem; min-width: 9rem; white-space: normal; }
td.blocker.ready { color: var(--good); font-weight: 700; }
.matrix { margin: 0; display: grid; gap: 10px; }
.mx { display: grid; grid-template-columns: minmax(84px, 0.6fr) repeat(3, minmax(0, 1fr)); gap: 6px; }
.mx-col, .mx-row-h { font-size: 0.82rem; color: var(--muted); display: grid; align-content: center; }
.mx-col { padding: 0 10px; }
.mx-col b, .mx-row-h b { font: 750 1.1rem/1.2 var(--display); color: var(--brand); }
.mx-cell { background: var(--panel); border: 1px solid var(--line); border-radius: 8px; padding: 10px; min-height: 64px; display: flex; flex-wrap: wrap; gap: 6px; align-content: flex-start; }
.mx-cell.start { border: 2px solid var(--accent); }
.mx-hint { flex-basis: 100%; font: 500 0.7rem/1.2 var(--mono); letter-spacing: 0.07em; text-transform: uppercase; color: var(--accent); }
.mx-empty { color: var(--line-strong); }
.mx-chip { display: inline-grid; place-items: center; min-width: 2.3em; height: 1.9em; padding: 0 6px; border-radius: 6px; font: 500 0.85rem/1 var(--mono); text-decoration: none; border: 1.5px solid transparent; font-variant-numeric: tabular-nums; }
.mx-chip.blocked { border: 1.5px dashed var(--line-strong); }
a.mx-chip:hover { border-color: var(--accent); }
.matrix figcaption { display: flex; flex-wrap: wrap; gap: 6px 16px; align-items: center; color: var(--muted); font-size: 0.85rem; }
.key { display: inline-flex; align-items: center; gap: 6px; }
.key .mx-chip { min-width: 1.4em; height: 1.2em; padding: 0; }
.defs { display: grid; grid-template-columns: max-content minmax(0, 1fr); gap: 8px 20px; margin: 0; max-width: 80ch; }
.defs dt { font-weight: 700; }
.defs dd { margin: 0; color: var(--muted); }
.foot { border-top: 1px solid var(--line); padding-top: 16px; color: var(--muted); font-size: 0.88rem; max-width: none; }
@media (max-width: 860px) {
  .layout { grid-template-columns: minmax(0, 1fr); }
  .toc { position: static; }
  .toc ol { grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); border-left: 0; }
  .toc a { padding-left: 0; }
}
@media (max-width: 700px) {
  .page { padding-inline: 16px; padding-block: 24px 48px; }
  .mx { grid-template-columns: 54px repeat(3, minmax(0, 1fr)); gap: 4px; }
  .mx-col span, .mx-row-h span, .mx-hint { display: none; }
  .mx-col { padding: 0 4px; }
  .mx-cell { padding: 6px; gap: 4px; min-height: 48px; }
  table.backlog thead { display: none; }
  table.backlog, table.backlog tbody, table.backlog tr { display: block; }
  table.backlog tr { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 4px 10px; padding: 12px; border-bottom: 1px solid var(--line); }
  table.backlog tr:last-child { border-bottom: 0; }
  table.backlog td { border: 0; padding: 0; }
  table.backlog td.item { min-width: 0; grid-column: 2; }
  table.backlog td.num { grid-row: 1; }
  table.backlog td[data-label] { grid-column: 2; display: flex; gap: 8px; align-items: baseline; font-size: 0.88rem; width: auto; min-width: 0; white-space: normal; }
  table.backlog td[data-label]::before { content: attr(data-label); font: 500 0.7rem/1.4 var(--mono); letter-spacing: 0.06em; text-transform: uppercase; color: var(--muted); min-width: 5.5em; }
  .defs { grid-template-columns: minmax(0, 1fr); gap: 2px; }
  .defs dd { margin-bottom: 8px; }
}
@media (prefers-reduced-motion: reduce) { * { scroll-behavior: auto !important; } }
`;

const JS = `
(function () {
  var q = document.getElementById("q");
  var chips = Array.prototype.slice.call(document.querySelectorAll(".chip"));
  var rows = Array.prototype.slice.call(document.querySelectorAll("tr[data-item]"));
  var count = document.getElementById("count");
  var mode = "All";
  function apply() {
    var term = q.value.trim().toLowerCase().replace(/^#/, "");
    var shown = 0;
    rows.forEach(function (r) {
      var okMode = mode === "All" || (mode === "Ready now" ? r.dataset.ready === "true" : r.dataset.priority === mode);
      var okText = !term || r.dataset.num === term || r.textContent.toLowerCase().indexOf(term) !== -1;
      r.hidden = !(okMode && okText);
      if (!r.hidden) shown++;
    });
    count.textContent = shown === rows.length ? "Showing all " + rows.length + " open items" : "Showing " + shown + " of " + rows.length + " open items";
  }
  function setMode(m) {
    mode = m;
    chips.forEach(function (c) { var on = c.dataset.filter === m; c.classList.toggle("on", on); c.setAttribute("aria-pressed", String(on)); });
    apply();
  }
  chips.forEach(function (c) { c.addEventListener("click", function () { setMode(c.dataset.filter); }); });
  q.addEventListener("input", apply);
  // A link to a filtered-out item clears the filter so the target is visible.
  window.addEventListener("hashchange", function () {
    var t = document.getElementById(location.hash.slice(1));
    if (t && t.hidden) { q.value = ""; setMode("All"); t.scrollIntoView(); }
  });
  apply();
})();
`;
