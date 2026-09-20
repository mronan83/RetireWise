# Disaster recovery

## Stated objectives

| | Target | Basis |
| --- | --- | --- |
| **RPO** — data that can be lost | 24 hours | Supabase's automatic daily backup on the current plan. |
| **RTO** — time to restore | 4 hours | A restore plus a redeploy, performed by one person who may be asleep when it starts. |

These are the honest numbers for how this is actually run, not aspirational
ones. If either matters more than that, the plan has to change — point-in-time
recovery on a paid Supabase plan takes the RPO to minutes.

**Neither has been rehearsed.** A backup that has never been restored is a
belief, not a capability. See below.

## What would have to be recovered

- **The database** — everything. Supabase backups cover it.
- **Environment variables** — held only in Vercel. If the project were lost,
  the encryption keys go with it, and every stored Plaid token and AI key
  becomes unopenable even with the database intact. **Keep an offline copy of
  `ENCRYPTION_KEY` and `PLAID_TOKEN_ENCRYPTION_KEY` somewhere that is not
  Vercel.** This is the single point of failure most likely to turn a
  recoverable incident into an unrecoverable one.
- **The application** — GitHub, and redeployable from any commit.

## Restoring

1. Supabase dashboard → Database → Backups → restore the chosen point.
2. Confirm the schema is current: `pnpm db:migrate` is idempotent and will
   apply anything the backup predates.
3. Verify `/api/health` reports `database: true` and the expected database name.
4. Verify `/api/health/freshness`. Stale immediately after a restore is
   expected; it should clear after the next cron run.
5. Check row counts against what the household expects. A restore that silently
   lands on an older snapshot than intended looks exactly like a successful one.

## Rehearsing it

Twice a year, and after any change to how the database is hosted:

1. Restore a backup into a **new** Supabase project — never over the live one.
2. Point a local checkout at it and run `pnpm build && pnpm test:rls`.
3. Time it, end to end, and write the number here.

| Date | Restored from | Time taken | Notes |
| --- | --- | --- | --- |
| — | — | — | Not yet rehearsed. |

Filling in that row is the only thing that turns the RTO above from a guess
into a measurement.
