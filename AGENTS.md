<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Deploying

Merging to `main` does not deploy: `vercel.json` turns off Git auto-deploys for `main`. Production changes only when the user explicitly asks for a deploy, and then through `pnpm deploy:prod` (`scripts/deploy-production.ts`), which refuses commits that are not on `main` or whose CI is not green. Never deploy as a side effect of merging, fixing CI, or finishing a task. Preview deployments of other branches are unaffected.

# Backlog

`docs/BACKLOG.md` is the backlog. Change it in the same PR as the work that opens or closes an item; CI fails if it does not parse (`pnpm backlog:check`).

The RetireWise Backlog page is generated from it and published **only after a successful `pnpm deploy:prod`**, never after a merge, a PR or a dry run, so it always describes what is live. When a release succeeds, `deploy:prod` writes `.backlog/backlog.html`; publish that file to the existing RetireWise Backlog artifact (find it by that title in the Artifact list; create it only on the first release) so the URL stays the same. Do not write the backlog out in chat; link the page.

# Replies to the owner

End every reply with a section headed **Your move** that lists only what the owner alone has to do: decisions, approvals ("merge", "deploy", a go-ahead), and actions in accounts Claude cannot reach. For each, say exactly what to do, where, and roughly how long it takes, most urgent first. If there is nothing, write "Nothing needed from you." Keep everything else above that section.
