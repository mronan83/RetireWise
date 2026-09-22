-- Record what a household owns and what it owes, not just the difference.
--
-- A snapshot stored four asset figures and one debt figure, and the asset
-- figures were EQUITY: real_estate_equity was the house less its mortgage,
-- vehicle_equity the cars less their loans. total_debts then held only what
-- was left over — the unsecured balances. That reaches the right net worth:
--
--   (investments + cash + asset EQUITY) - UNSECURED debts
--
-- but it cannot answer "how much do we owe". Every screen read total_debts
-- under the heading "Total Debts" and showed $12,836.07 of credit cards for a
-- household carrying $282,545.22, because two mortgages, a camper and a truck
-- had been netted into the assets above and never counted again.
--
-- These three columns record the other side, so a row carries both bases:
--
--   gross assets = investment_value + real_estate_value + cash_total + vehicle_value
--   total owed   = total_debts + secured_debts
--   net worth    = gross assets - total owed      (unchanged, to the cent)
--
-- Nullable, with no backfill and no default. Rows written before today were
-- composed without the secured split and it cannot be reconstructed: the
-- balance of each mortgage on each past date was never stored anywhere. A
-- zero would read as "owed nothing secured", which is false; NULL reads as
-- "not recorded", which is true, and the chart draws the history on the basis
-- it was actually recorded on rather than on a fabricated one.
ALTER TABLE "net_worth_snapshots" ADD COLUMN "real_estate_value" numeric(20, 2);--> statement-breakpoint
ALTER TABLE "net_worth_snapshots" ADD COLUMN "vehicle_value" numeric(20, 2);--> statement-breakpoint
ALTER TABLE "net_worth_snapshots" ADD COLUMN "secured_debts" numeric(20, 2);
