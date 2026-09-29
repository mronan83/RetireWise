<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Deploying

Merging to `main` does not deploy: `vercel.json` turns off Git auto-deploys for `main`. Production changes only when the user explicitly asks for a deploy, and then through `pnpm deploy:prod` (`scripts/deploy-production.ts`), which refuses commits that are not on `main` or whose CI is not green. Never deploy as a side effect of merging, fixing CI, or finishing a task. Preview deployments of other branches are unaffected.
