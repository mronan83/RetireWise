# Annual tax update

The one piece of maintenance this app requires on a calendar, rather than
when something breaks. It takes about fifteen minutes, once a year.

## Why it exists

Every retirement number on the Financial Analytics page — the tax
projection, the Roth conversion ladder, the RMD tax estimate, the
healthcare projection — is computed against one year's federal schedule.
Those figures used to be `const` arrays in `src/lib/utils/financial-analytics.ts`,
and they were wrong once already: commented "2025" while carrying 2024
figures. Nothing in the product could say so, because nothing in the
product knew which year it was computing.

They now live in the `tax_reference` table and the page states the year it
used. A year behind is a visible amber caption. Two or more is red. That
is the whole point: **the app will tell you when this job is due**, so
this document only has to say how to do it.

## When

Two source documents, both published in the autumn:

| Figure | Source | Typically out |
|---|---|---|
| Brackets, standard deduction (MFJ) | IRS Revenue Procedure for that year's inflation adjustments — search "Rev. Proc. inflation adjustments &lt;year&gt;" on irs.gov | October–November |
| Part B premium, Part D base, IRMAA thresholds and surcharges | CMS annual Medicare premium notice, cms.gov newsroom | November |
| 401(k)/403(b)/IRA/HSA contribution limits | IRS Notice on retirement plan limits, irs.gov | November |

Note the IRMAA lookback: the tiers for a year are applied to the return
filed **two years earlier**.

## How

1. Open `src/lib/tax/seed.ts` and append an entry to `SEED_TAX_YEARS`,
   copying the shape of the year above it. Every field must be filled —
   see *All or nothing* below.
2. Open `src/app/api/irs-limits/refresh/route.ts` and append the year's
   contribution limits to `KNOWN_LIMITS`.
3. `pnpm exec tsx scripts/test-tax-reference.ts`. It asserts the new year
   loads back through the validator and that no row collides on the upsert
   key. If it fails, the year is incomplete or mis-ordered — fix it here,
   not in the database.
4. Deploy, then `POST /api/irs-limits/refresh` while signed in. The
   response reports `taxReference.activeTaxYear` and `source`.
5. Load `/analytics`. The caption should read the new year and be grey.
   If it still says the old year, or says "built-in fallback", the seed
   did not take — check the response from step 4.

Nothing else changes. No migration, no code change outside those two
files.

## All or nothing

`buildTaxTable()` rejects an incomplete year rather than loading part of
it, and falls back to the previous year. This is deliberate. Three of
seven brackets produces a tax figure that looks entirely reasonable and is
wrong by tens of thousands of dollars; a stale year that announces itself
is strictly better than a fresh year that is quietly half-loaded.

So do not seed brackets for a new year while waiting on the CMS notice for
its IRMAA tiers. Wait, and let the caption stay amber until you have both.

## The planning assumptions

Three figures in each year are **not** published rates, and are labelled
as such in the table's `notes`:

- `medigap_monthly` — Medigap/Advantage supplemental, per person
- `pre_medicare_premium_monthly` — ACA marketplace, per couple
- `out_of_pocket_annual` — out-of-pocket medical, per couple

Carry them forward at your own inflation estimate. They are assumptions
about this household, not facts about the tax code, and nobody will
publish a correction if they drift.

## If the table is empty

The app falls back to the built-in 2025 figures in
`src/lib/tax/table.ts` and says "built-in fallback — the reference table
has no usable data" on the analytics page. Every number still renders and
every number is honest about where it came from. Running the refresh
endpoint fixes it.
