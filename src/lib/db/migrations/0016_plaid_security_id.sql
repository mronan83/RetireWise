-- Match positions to their transactions on Plaid's security id, not on a
-- ticker string we derived.
--
-- `ticker_symbol || cusip || name` is not stable across Plaid's endpoints.
-- One Schwab 401(k) here returns `GG.EUPAC.TRUST.R1` for a holding and
-- `RERGX` for that same fund's transactions, `VG.IS.TL.INTL.STK.MK` against
-- `VTSNX`, and so on — so 8 of 13 positions joined to none of the account's
-- 727 transactions and were reported as having "no transactions in the
-- window". The window was full of them.
--
-- Nullable and not backfilled: rows already stored carry no security id, and
-- there is nothing in the database to derive one from. They keep matching on
-- ticker until the next sync writes an id for them. Rows a person typed in
-- have no Plaid identity and stay null for good.
ALTER TABLE "holdings" ADD COLUMN "plaid_security_id" text;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "plaid_security_id" text;
