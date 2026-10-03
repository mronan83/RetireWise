/**
 * The small Markdown these living documents are written in, parsed into
 * sections and entries, and rendered to HTML.
 *
 *   # Title
 *   Last reviewed: YYYY-MM-DD
 *   intro paragraphs
 *   ## Section            → a section, with its own blocks
 *   ### Entry title       → an entry: an optional first list of "Key: value"
 *                           fields, then blocks
 *
 * Blocks are paragraphs, bullet and numbered lists (one level of nesting,
 * two-space indent), pipe tables, and fenced code. A ```mermaid fence
 * becomes a diagram.
 * HTML comments are notes for editors and never rendered.
 */
import { esc } from "./inline";

export type ListItem = { text: string; children: string[] };
export type Block =
  | { kind: "p"; text: string }
  | { kind: "ul" | "ol"; items: ListItem[] }
  | { kind: "code"; lang: string; text: string }
  | { kind: "table"; head: string[]; rows: string[][] };

export interface Entry {
  heading: string;
  title: string;
  fields: Record<string, string>;
  blocks: Block[];
}

export interface Section {
  name: string;
  blocks: Block[];
  entries: Entry[];
}

export interface Doc {
  title: string;
  lastReviewed: string;
  intro: Block[];
  sections: Section[];
}

export function toBlocks(lines: string[]): Block[] {
  const blocks: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() === "") { i++; continue; }
    const fence = line.match(/^```(\w*)\s*$/);
    if (fence) {
      const body: string[] = [];
      i++;
      while (i < lines.length && !/^```\s*$/.test(lines[i])) body.push(lines[i++]);
      i++;
      blocks.push({ kind: "code", lang: fence[1], text: body.join("\n") });
      continue;
    }
    if (/^\|.*\|\s*$/.test(line)) {
      const cells = (l: string) => l.trim().slice(1, -1).split(/(?<!\\)\|/).map((c) => c.trim().replace(/\\\|/g, "|"));
      const head = cells(line);
      i++;
      if (i < lines.length && /^\|[\s:|-]+\|\s*$/.test(lines[i])) i++;
      const rows: string[][] = [];
      while (i < lines.length && /^\|.*\|\s*$/.test(lines[i])) rows.push(cells(lines[i++]));
      blocks.push({ kind: "table", head, rows });
      continue;
    }
    const bullet = /^(-|\d+\.)\s+/;
    if (bullet.test(line)) {
      const ordered = /^\d+\./.test(line);
      const items: ListItem[] = [];
      while (i < lines.length && (bullet.test(lines[i]) || /^\s{2,}(-|\d+\.)\s+/.test(lines[i]) || (/^\s{2,}\S/.test(lines[i]) && items.length))) {
        const l = lines[i];
        if (bullet.test(l)) items.push({ text: l.replace(bullet, "").trim(), children: [] });
        else if (/^\s{2,}(-|\d+\.)\s+/.test(l)) items[items.length - 1].children.push(l.trim().replace(bullet, "").trim());
        else items[items.length - 1].text += " " + l.trim();
        i++;
      }
      blocks.push({ kind: ordered ? "ol" : "ul", items });
      continue;
    }
    const para: string[] = [];
    while (i < lines.length && lines[i].trim() !== "" && !/^```/.test(lines[i]) && !bullet.test(lines[i]) && !/^\|/.test(lines[i])) para.push(lines[i++].trim());
    blocks.push({ kind: "p", text: para.join(" ") });
  }
  return blocks;
}

function toEntry(heading: string, lines: string[]): Entry {
  const blocks = toBlocks(lines);
  const fields: Record<string, string> = {};
  const first = blocks[0];
  if (first?.kind === "ul" && first.items.every((it) => /^[A-Z][A-Za-z ]+:/.test(it.text) && it.children.length === 0)) {
    for (const it of first.items) {
      const at = it.text.indexOf(":");
      fields[it.text.slice(0, at).trim()] = it.text.slice(at + 1).trim();
    }
    blocks.shift();
  }
  return { heading, title: heading, fields, blocks };
}

export function parseDoc(markdown: string): Doc {
  const text = markdown.replace(/<!--[\s\S]*?-->/g, "");
  const lines = text.split("\n");
  const doc: Doc = { title: "", lastReviewed: "", intro: [], sections: [] };
  let introLines: string[] = [];
  let section: Section | null = null;
  let sectionLines: string[] = [];
  let entry: { heading: string; lines: string[] } | null = null;
  let inFence = false;

  const closeEntry = () => {
    if (entry && section) section.entries.push(toEntry(entry.heading, entry.lines));
    entry = null;
  };
  const closeSection = () => {
    closeEntry();
    if (section) {
      section.blocks = toBlocks(sectionLines);
      doc.sections.push(section);
    }
    section = null;
    sectionLines = [];
  };

  for (const line of lines) {
    if (/^```/.test(line)) inFence = !inFence;
    if (!inFence && /^# /.test(line)) { doc.title = line.slice(2).trim(); continue; }
    if (!inFence && /^Last reviewed:/.test(line)) { doc.lastReviewed = line.split(":")[1].trim(); continue; }
    if (!inFence && /^## /.test(line)) {
      if (!section) { doc.intro = toBlocks(introLines); introLines = []; }
      closeSection();
      section = { name: line.slice(3).trim(), blocks: [], entries: [] };
      continue;
    }
    if (!inFence && /^### /.test(line) && section) {
      closeEntry();
      entry = { heading: line.slice(4).trim(), lines: [] };
      continue;
    }
    if (entry) entry.lines.push(line);
    else if (section) sectionLines.push(line);
    else introLines.push(line);
  }
  if (!section && introLines.length) doc.intro = toBlocks(introLines);
  closeSection();
  return doc;
}

export function section(doc: Doc, prefix: string): Section | undefined {
  return doc.sections.find((s) => s.name.toLowerCase().startsWith(prefix.toLowerCase()));
}

/** Every backticked repository path in a piece of text. */
export function pathsIn(text: string): string[] {
  return [...text.matchAll(/`((?:src|scripts|e2e|docs|\.github|public)\/[^`\s:]+|[A-Za-z0-9_.-]+\.(?:json|md|ts|mjs|yml))(?::\d+(?:-\d+)?)?`/g)].map((m) => m[1]);
}

/** All the text of a set of blocks, for searching and checking. */
export function blockText(blocks: Block[]): string {
  return blocks
    .map((b) =>
      b.kind === "p" || b.kind === "code"
        ? b.text
        : b.kind === "table"
          ? [...b.head, ...b.rows.flat()].join(" ")
          : b.items.map((i) => [i.text, ...i.children].join(" ")).join(" ")
    )
    .join(" ");
}

export function renderBlocks(blocks: Block[], inline: (s: string) => string, cls = ""): string {
  const c = cls ? ` class="${cls}"` : "";
  return blocks
    .map((b) => {
      if (b.kind === "p") return `<p${c}>${inline(b.text)}</p>`;
      if (b.kind === "code") {
        return b.lang === "mermaid"
          ? `<div class="mermaid-wrap"><pre class="mermaid">${esc(b.text)}</pre></div>`
          : `<pre class="codeblock"><code>${esc(b.text)}</code></pre>`;
      }
      if (b.kind === "table") {
        return `<div class="scroll"><table class="plain"><thead><tr>${b.head.map((h) => `<th scope="col">${inline(h)}</th>`).join("")}</tr></thead><tbody>${b.rows
          .map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join("")}</tr>`)
          .join("")}</tbody></table></div>`;
      }
      const tag = b.kind;
      return `<${tag}${c}>${b.items
        .map((it) => `<li>${inline(it.text)}${it.children.length ? `<ul>${it.children.map((ch) => `<li>${inline(ch)}</li>`).join("")}</ul>` : ""}</li>`)
        .join("")}</${tag}>`;
    })
    .join("\n");
}
