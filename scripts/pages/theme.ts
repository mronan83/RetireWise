/**
 * The RetireWise page theme, shared by every generated page (traceability,
 * architecture, data model) so the brand cannot drift between them.
 *
 * Teal on a cool, slightly green paper; Archivo for display, IBM Plex Sans
 * for reading and IBM Plex Mono for code and data. Every colour is a token
 * defined for light first, then redefined for dark under both the system
 * setting and an explicit data-theme choice.
 */

export const FONTS = `<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@87..100,500..800&family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:wght@400;500;600;700&display=swap">`;

export const BASE_CSS = `
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

/**
 * What the architecture and data model pages add to the base: diagrams,
 * cards for tables and decision records, key markers and health rows.
 */
export const DOC_CSS = `
.mermaid-wrap { overflow-x: auto; background: var(--panel); border: 1px solid var(--line); border-radius: 8px; padding: 16px; }
.mermaid-wrap pre.mermaid { margin: 0; background: transparent; font: 400 0.78rem/1.45 var(--mono); color: var(--muted); white-space: pre; }
.mermaid-wrap svg { max-width: 100%; height: auto; }
figure.diagram { margin: 0; display: grid; gap: 8px; min-width: 0; }
figure.diagram figcaption { color: var(--muted); font-size: 0.88rem; max-width: 80ch; }
.codeblock { margin: 0; overflow-x: auto; background: var(--soft); border-radius: 8px; padding: 12px 14px; font: 400 0.82rem/1.5 var(--mono); }
.codeblock code { background: transparent; padding: 0; font-size: inherit; }
.prose { display: grid; gap: 10px; max-width: 80ch; }
.prose ul, .prose ol, .entry ul, .entry ol { margin: 0; padding-left: 1.2em; display: grid; gap: 4px; }
.prose ul ul, .entry ul ul { margin-top: 4px; }
.cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 300px), 1fr)); gap: 12px; }
.card { background: var(--panel); border: 1px solid var(--line); border-radius: 8px; padding: 14px 16px; display: grid; gap: 8px; align-content: start; min-width: 0; scroll-margin-top: 100px; }
.card:target, .entry:target, .tcard:target { outline: 2px solid var(--accent); outline-offset: 2px; }
.card h3 { font-size: 1.02rem; }
.card .count { font: 500 0.78rem/1.2 var(--mono); color: var(--muted); }
.tags { display: flex; flex-wrap: wrap; gap: 6px; }
.tag { font: 500 0.78rem/1 var(--mono); padding: 4px 8px; border-radius: 4px; background: var(--soft); color: var(--ink); text-decoration: none; }
a.tag:hover { background: var(--accent-soft); color: var(--accent); }
.dhead { font-size: 1.15rem; padding-top: 10px; border-top: 1px solid var(--line); }
.tcard { background: var(--panel); border: 1px solid var(--line); border-radius: 8px; padding: 16px; display: grid; gap: 12px; min-width: 0; scroll-margin-top: 130px; }
.thead { display: flex; flex-wrap: wrap; align-items: baseline; gap: 6px 10px; }
.thead h3 { margin-right: 4px; }
.thead h3 code { font-size: 1rem; background: transparent; padding: 0; }
.badge { font: 500 0.72rem/1 var(--mono); padding: 4px 8px; border-radius: 999px; border: 1px solid var(--line-strong); color: var(--muted); white-space: nowrap; }
.badge.ok { border-color: transparent; background: var(--good-soft); color: var(--good); }
.badge.warn { border-color: transparent; background: var(--warn-soft); color: var(--warn); }
.badge.bad { border-color: transparent; background: var(--bad-soft); color: var(--bad); }
.badge.key { border-color: transparent; background: var(--accent-soft); color: var(--accent); }
.badge.plan { border-color: transparent; background: var(--plan-soft); color: var(--plan); }
.fields { display: grid; grid-template-columns: max-content minmax(0, 1fr); gap: 4px 14px; margin: 0; font-size: 0.92rem; max-width: 86ch; }
.fields dt { font: 500 0.72rem/1.9 var(--mono); letter-spacing: 0.06em; text-transform: uppercase; color: var(--muted); }
.fields dd { margin: 0; }
.scroll { overflow-x: auto; border: 1px solid var(--line); border-radius: 8px; background: var(--panel); }
.tcard .scroll { border-color: var(--line); }
table.cols td, table.cols th, table.plain td, table.plain th { padding: 7px 10px; }
table.cols td.cname { white-space: nowrap; font-weight: 500; }
table.cols td.ctype code, table.cols td.cdef code { white-space: nowrap; overflow-wrap: normal; }
td.cnote { min-width: 14rem; color: var(--muted); }
td.cref { min-width: 7rem; }
.g-household { fill: var(--accent); }
.g-reference { fill: var(--plan); }
.g-system { fill: var(--warn); }
.g-shared { fill: var(--muted); }
.map-t { font-size: 11.5px; fill: var(--ink); }
.legend { display: flex; flex-wrap: wrap; gap: 6px 18px; font-size: 0.85rem; color: var(--muted); max-width: none; }
.legend span { display: inline-flex; align-items: center; gap: 6px; }
.model .legend svg, .legend svg { width: 12px; height: 12px; min-width: 0; display: inline-block; flex: none; }
.model a:hover .nd { stroke: var(--accent); }
.nowrap { white-space: nowrap; }
.k { display: inline-block; margin-left: 6px; font: 600 0.62rem/1 var(--mono); padding: 3px 5px; border-radius: 3px; vertical-align: 2px; letter-spacing: 0.04em; }
.k.pk { background: var(--accent-soft); color: var(--accent); }
.k.fk { background: var(--plan-soft); color: var(--plan); }
.k.uq { background: var(--quiet); color: var(--muted); }
.k.hk { background: var(--good-soft); color: var(--good); }
details { border-top: 1px solid var(--line); padding-top: 8px; }
details > summary { cursor: pointer; color: var(--muted); font-size: 0.9rem; font-weight: 500; }
details[open] > summary { margin-bottom: 8px; }
.entries { display: grid; gap: 12px; }
.entry { background: var(--panel); border: 1px solid var(--line); border-radius: 8px; padding: 14px 16px; display: grid; gap: 10px; min-width: 0; scroll-margin-top: 100px; }
.entry > p, .entry > ul, .entry > ol { max-width: 80ch; }
.entry h3 { display: flex; flex-wrap: wrap; gap: 4px 10px; align-items: baseline; }
.entry h3 .code { font-family: var(--mono); font-size: 0.82rem; font-weight: 500; color: var(--muted); }
.health { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; max-width: 92ch; }
.health li { display: grid; grid-template-columns: 22px minmax(0, 1fr); gap: 10px; padding: 10px 14px; background: var(--panel); border: 1px solid var(--line); border-radius: 8px; }
.health li.warn { border-color: var(--warn); }
.health .mark { width: 20px; height: 20px; border-radius: 4px; display: grid; place-items: center; font-size: 0.78rem; font-weight: 700; }
.health li.ok .mark { background: var(--good-soft); color: var(--good); }
.health li.warn .mark { background: var(--warn-soft); color: var(--warn); }
.health li.info .mark { background: var(--quiet); color: var(--muted); }
.health .detail { color: var(--muted); font-size: 0.88rem; }
.problems { background: var(--bad-soft); color: var(--ink); border: 1px solid var(--bad); border-radius: 8px; padding: 12px 16px; display: grid; gap: 6px; }
.problems ul { margin: 0; padding-left: 1.2em; font-size: 0.9rem; }
@media (max-width: 560px) {
  .fields { grid-template-columns: minmax(0, 1fr); gap: 0; }
  .fields dd { margin-bottom: 8px; }
  .tcard, .entry, .card { padding: 12px; }
  td.cnote { min-width: 12rem; }
}
`;
