<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Deploying

Merging to `main` does not deploy: `vercel.json` turns off Git auto-deploys for `main`. Production changes only when the user explicitly asks for a deploy, and then through `pnpm deploy:prod` (`scripts/deploy-production.ts`), which refuses commits that are not on `main` or whose CI is not green. Never deploy as a side effect of merging, fixing CI, or finishing a task. Preview deployments of other branches are unaffected.

# Backlog

`docs/BACKLOG.md` is the backlog. Change it in the same PR as the work that opens or closes an item; CI fails if it does not parse (`pnpm backlog:check`).

The RetireWise Backlog page is generated from it and published **only after a successful `pnpm deploy:prod`**, never after a merge, a PR or a dry run, so it always describes what is live. When a release succeeds, `deploy:prod` writes `.pages/backlog.html`; publish that file to the existing RetireWise Backlog artifact (find it by that title in the Artifact list; create it only on the first release) so the URL stays the same. Do not write the backlog out in chat; link the page.

# Requirements and traceability

`docs/REQUIREMENTS.md` states what RetireWise must do and traces each requirement to the features that deliver it, the code that builds them, the checks that prove them, and the backlog items that would close any gap. Claude is responsible for keeping it accurate and complete.

- A PR that changes behaviour updates the affected requirements and features and adds a change-log line, in the same PR. CI fails a PR that changes `src/` without touching the file, unless a commit message says `Traceability: unchanged — <why>`. Use that line only when behaviour truly does not change.
- `pnpm trace:check`, also in CI, fails when a named file does not exist, a Verified status names no check that CI runs, an Implemented status hides one, a page or API route belongs to no feature, a CI check traces to nothing, or a gap disagrees with the backlog. Fix the document or the code, never the check, to make it pass.
- A new or changed requirement from the owner goes in as Planned. Propose the features, checks and backlog items it needs.
- When the owner answers an open question, record the answer under it, change what it decides, open any gap it creates (every gap is also a backlog item), and add a change-log line.
- A status moves only with evidence. Verified needs a check that runs in CI; Partial names the backlog item or gap that holds it back.
- The page is published only after a successful `pnpm deploy:prod`, beside the backlog. `deploy:prod` writes `.pages/traceability.html`; publish it to the existing RetireWise Requirements & Feature Traceability artifact (create it only on the first release).

# Architecture and data model

`docs/ARCHITECTURE.md` and `docs/DATA-MODEL.md` describe how RetireWise is built and what its data means. Each is half written, half generated from the code, and Claude keeps both accurate.

- Assess both against every change, fix or enhancement, before the PR is opened. Update what the change affects: a principle, flow, risk or decision record (add an ADR when a choice is made; supersede, never delete); a table's purpose, writers, column notes, rules or derived data.
- `pnpm arch:check` and `pnpm datamodel:check` run in CI. Fix the document or the code, never the check.
- A PR that reshapes the system (a dependency, configuration, CI, the proxy, tenancy or auth code, a page, route or module added or removed) must change `docs/ARCHITECTURE.md`, and one that changes the schema or a migration must change `docs/DATA-MODEL.md`, unless a commit message says `Architecture: unchanged — <why>` or `Data model: unchanged — <why>`. Use those lines only when the meaning truly does not change.
- A defect found while assessing becomes a gap and a backlog item in the same PR, as the traceability rules require.
- The pages are published only after a successful `pnpm deploy:prod`, beside the backlog and traceability pages. `deploy:prod` writes `.pages/architecture.html` and `.pages/data-model.html`; publish them to the existing RetireWise Technical Architecture and RetireWise Data Model artifacts (create each only on its first release).

# How RetireWise works

`docs/HOW-IT-WORKS.md` explains every calculation RetireWise performs: the projection, Social Security, taxes, required distributions, withdrawals, the odds, the analytics and the everyday figures. Its page runs the production engine, bundled from the released commit, so readers can change the inputs and watch the real calculation. Claude keeps it accurate.

- Assess it against every change that touches a calculation. Update the explanation and formula the change affects, the code map row for any function added, renamed or removed, and add a change-log line.
- Never type a figure the code holds (a rate, limit, default or result). Write `{{key}}` and let the page fill it from the code; `pnpm how:check` lists the keys and fails on an unknown one.
- `pnpm how:check` runs in CI and fails when a calculation module or exported function is missing from the code map, a "Code:" line names a function that is not where it says, a "Checked by:" names a check CI does not run, or the engine or example household no longer runs. Fix the document or the code, never the check.
- A PR that changes a calculation module or `scripts/how-it-works/engine-entry.ts` must change `docs/HOW-IT-WORKS.md`, unless a commit message says `How it works: unchanged — <why>`.
- The page is published only after a successful `pnpm deploy:prod`, beside the others. `deploy:prod` writes `.pages/how-it-works.html`; publish it to the existing How RetireWise Works artifact (create it only on its first release).

# Replies to the owner

Every reply that reports a change, fix or enhancement includes a **Living documents** section, placed just before **Your move**, with one line for each of Requirements, Backlog, Architecture, Data model and How it works. Each line says what was revised, or "assessed, unchanged" and why. Say also whether the published pages are current or wait on the next release.

End every reply with a section headed **Your move** that lists only what the owner alone has to do: decisions, approvals ("merge", "deploy", a go-ahead), and actions in accounts Claude cannot reach. For each, say exactly what to do, where, and roughly how long it takes, most urgent first. If there is nothing, write "Nothing needed from you." Keep everything else above that section.
