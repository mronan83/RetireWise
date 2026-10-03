/**
 * Check, preview or enforce the data model document.
 *
 *   pnpm datamodel:check
 *       Check docs/DATA-MODEL.md against the schema and migrations on disk:
 *       every table and enum is described, in a domain, with notes only on
 *       columns and values that exist; every named file exists; the schema
 *       and the migrations declare the same indexes; and no household table
 *       is without row-level security. Runs in CI.
 *
 *   pnpm datamodel:build [--sha <commit>] [--previous <commit>] [--out <path>]
 *       Write the page. Without --sha it is a preview of the working tree.
 *       The published page is built by deploy:prod after a successful release.
 *
 *   tsx scripts/build-data-model.ts --require-update <base>
 *       For a pull request: fail if it changes the schema or a migration
 *       without changing docs/DATA-MODEL.md, unless a commit in the range
 *       carries a "Data model: unchanged — <reason>" line. Runs in CI.
 */
import { readFileSync } from "fs";
import { buildModelPage } from "./data-model/build";
import { DOC_FILE, introspect, parseModelDoc, validate } from "./data-model/model";
import { renderModelPage } from "./data-model/render";
import { git } from "./pages/release";

const args = process.argv.slice(2);
const option = (name: string) => {
  const at = args.indexOf(name);
  return at === -1 ? undefined : args[at + 1];
};

function fail(message: string): never {
  console.error(`✗ ${message}`);
  process.exit(1);
}

async function main() {
  if (args.includes("--check")) {
    const model = parseModelDoc(readFileSync(DOC_FILE, "utf8"));
    const catalog = await introspect();
    const report = validate(model, catalog);
    if (report.errors.length > 0) fail(`${DOC_FILE} does not match the schema (${report.errors.length}):\n  ${report.errors.join("\n  ")}`);
    renderModelPage(model, catalog, report, { sha: "0000000", date: "", firstPublication: true, changes: [] });
    console.log(
      `✓ ${DOC_FILE}: ${catalog.tables.length} tables in ${model.domains.length} domains, ${catalog.enums.length} enums, ${model.rules.length} business rules; every table described and protected`
    );
  } else if (option("--require-update")) {
    const base = option("--require-update")!;
    const changed = git("diff", "--name-only", `${base}...HEAD`).split("\n").filter(Boolean);
    const schema = changed.filter((f) => f.startsWith("src/lib/db/schema") || f.startsWith("src/lib/db/migrations/"));
    if (schema.length === 0 || changed.includes(DOC_FILE)) {
      console.log(`✓ Data model: ${schema.length === 0 ? "no schema or migration changed" : `${DOC_FILE} updated with the schema`}`);
    } else {
      const waiver = git("log", "--format=%B", `${base}..HEAD`).match(/^Data model: unchanged\s*[—-]\s*(.+)$/m);
      if (waiver) console.log(`✓ Data model: unchanged, because ${waiver[1].trim()}`);
      else
        fail(
          `This change touches the schema (${schema.slice(0, 5).join(", ")}${schema.length > 5 ? ", …" : ""}) but not ${DOC_FILE}.\n` +
            `  Describe the new or changed tables, columns and rules and add a change-log line, or, if the\n` +
            `  meaning of the data is truly unchanged, add a line to a commit message: "Data model: unchanged — <why>".`
        );
    }
  } else {
    const { out, problems } = await buildModelPage({ sha: option("--sha"), previousSha: option("--previous"), out: option("--out"), preview: true });
    console.log(`✓ Wrote ${out}`);
    if (problems.length) console.warn(`  ⚠ ${problems.length} problem(s); run pnpm datamodel:check.`);
  }
}

main().catch((e) => fail(e instanceof Error ? e.message : String(e)));
