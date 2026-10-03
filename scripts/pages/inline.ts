/**
 * Inline text → HTML for the generated pages: code spans, repository file
 * links pinned to the commit the page describes, links, bold and italics,
 * backlog references (#N), requirement IDs (to the traceability page) and
 * IDs defined on the page itself.
 */

export const REPO_URL = "https://github.com/mronan83/RetireWise";
export const BACKLOG_URL = "https://claude.ai/artifact/F3ADTDsC9HU4ZpyvSzyr6R";
export const TRACE_URL = "https://claude.ai/artifact/RFE6NjpBDekEywADE7gWam";

export function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export const anchor = (id: string) => id.toLowerCase().replace(/[^a-z0-9_-]+/g, "-");

const FILE = /^((?:src|scripts|e2e|docs|\.github|public)\/[^\s:]+|[A-Za-z0-9_.-]+\.(?:json|md|ts|mjs|yml))(?::(\d+(?:-\d+)?))?$/;
const TRACE_IDS = /\b(BO-\d+|NFR-[A-Z]+-\d{2}|FR-[A-Z]+-\d{2}|F-\d{2}|GAP-\d{2})\b/g;

/**
 * `local` maps an identifier that has an anchor on this page (a decision
 * record, a table name) to that anchor; it is matched inside code spans
 * (`accounts`) and, for IDs like ADR-007, in running text too.
 */
export function makeInline(sha: string, local: Map<string, string> = new Map()) {
  const fileLink = (path: string, line?: string) => {
    const href = `${REPO_URL}/blob/${sha}/${path.split("/").map(encodeURIComponent).join("/")}${line ? `#L${line.replace("-", "-L")}` : ""}`;
    return `<a class="file" href="${esc(href)}" target="_blank" rel="noopener"><code>${esc(path)}${line ? `:${esc(line)}` : ""}</code></a>`;
  };
  const localIds = [...local.keys()].filter((k) => /^[A-Z]+-\d+$/.test(k));
  const localRe = localIds.length ? new RegExp(`\\b(${localIds.map((k) => k.replace(/[-]/g, "\\-")).join("|")})\\b`, "g") : null;
  return (s: string): string =>
    s
      .split(/(`[^`]+`)/)
      .map((part) => {
        if (part.length > 1 && part.startsWith("`") && part.endsWith("`")) {
          const inner = part.slice(1, -1);
          const m = inner.match(FILE);
          if (m) return fileLink(m[1], m[2]);
          const target = local.get(inner);
          return target ? `<a class="ref" href="#${target}"><code>${esc(inner)}</code></a>` : `<code>${esc(inner)}</code>`;
        }
        let out = esc(part)
          .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
          .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
          .replace(/(^|[\s(])_([^_\s][^_]*[^_\s]|[^_\s])_(?=[\s.,;:)]|$)/g, "$1<em>$2</em>")
          .replace(TRACE_IDS, (id: string) =>
            `<a class="ref" href="${TRACE_URL}#${id.toLowerCase()}" target="_blank" rel="noopener" title="In the requirements traceability page">${id}</a>`
          )
          .replace(/(^|[\s(,;])#(\d+)\b/g, (_m, pre: string, n: string) =>
            `${pre}<a class="ref bl" href="${BACKLOG_URL}#item-${n}" target="_blank" rel="noopener" title="Backlog item ${n}">#${n}</a>`
          );
        if (localRe) out = out.replace(localRe, (id: string) => `<a class="ref" href="#${local.get(id)}">${id}</a>`);
        return out;
      })
      .join("")
      // Bold or italics wrapped around a code span: **`withTenant`**.
      .replace(/\*\*(<(?:a|code)\b[\s\S]*?<\/(?:code|a)>)\*\*/g, "<strong>$1</strong>")
      .replace(/(^|[\s(])_(<(?:a|code)\b[\s\S]*?<\/(?:code|a)>)_(?=[\s.,;:)]|$)/g, "$1<em>$2</em>");
}
