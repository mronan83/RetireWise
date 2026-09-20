# Incident response

One person operates RetireWise. This is not an on-call rotation; it is the
sequence to follow so that the decisions are made in advance rather than at
the moment of discovery.

## What counts

1. **Data exposure** — one household could reach another's data, or data left
   the system.
2. **Credential compromise** — a database password, `CRON_SECRET`,
   `ENCRYPTION_KEY`, `PLAID_TOKEN_ENCRYPTION_KEY`, or a Plaid or Stripe secret
   is disclosed or suspected of being.
3. **Silent staleness** — `/api/health/freshness` reports stale, or figures are
   not moving. Lower severity, and the one most likely to go unnoticed: every
   page still renders, with last month's numbers.
4. **Outage** — `/api/health` fails or the app is unreachable.

## First fifteen minutes

Stop the bleeding before diagnosing.

- **Exposure:** revoke the affected sessions, and if the cause is a code change,
  roll back from Vercel's deployments list to the last known-good deployment.
  Rolling back is reversible; leaving data reachable is not.
- **Credential compromise:** rotate it. Database passwords in Supabase, secrets
  in Vercel's environment settings. For the encryption keys, follow the rotation
  in `.env.example` — set `_PREVIOUS` to the old value first, or every stored
  credential becomes unopenable.
- **Outage:** check `/api/health` for which dependency failed, then Supabase's
  status and Vercel's.

Write down the time and what was seen, before memory edits it.

## Then

1. **Scope it.** Which households, which tables, what window. `audit_log` holds
   invitations issued and redeemed, institutions linked and disconnected, and
   API keys stored and removed. Vercel runtime logs hold the request history.
2. **Fix the cause**, not just the symptom, and add the check that would have
   caught it. Every check in `scripts/` exists because something got through.
3. **Tell the affected households.** Promptly, in plain words, and before the
   picture is complete: what is known, what was reached, what to do. This is a
   handful of people known personally — a message that arrives late and polished
   is worse than one that arrives early and partial.
4. **Write down what happened** and what changed because of it.

## Recovery

See `docs/disaster-recovery.md`.

## Contacts

- Supabase project: `xrtsekeeztqofozqsgcl`
- Plaid: support via the Plaid dashboard for the linked items
- Vercel: project `retirewise`
