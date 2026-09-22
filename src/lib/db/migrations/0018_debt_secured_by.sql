-- Name the asset a loan is secured against, so it is subtracted once.
--
-- A car loan can be recorded twice: typed onto the vehicle as `loan_balance`,
-- and synced into `debts` as its own row. Net worth subtracted both —
--
--   vehicleEquity = vehicleValue - vehicleLoanTotal    -- once
--   netWorth      = (… + vehicleEquity) - debtTotal    -- and again
--
-- so the day a bank connection brought in two car loans already typed onto the
-- vehicles, the reported figure fell by $81,442.58 with nothing borrowed.
--
-- Nothing is backfilled. Only the owner can say whether two loans against one
-- car are one loan recorded twice or a genuine second lien, and guessing it
-- here would delete a real liability as readily as a duplicated one. The app
-- surfaces the candidate pairs instead; see compose.ts.
CREATE TYPE "debt_security" AS ENUM('real_estate', 'vehicle');--> statement-breakpoint
ALTER TABLE "debts" ADD COLUMN "secured_by_type" "debt_security";--> statement-breakpoint
ALTER TABLE "debts" ADD COLUMN "secured_by_id" uuid;--> statement-breakpoint
CREATE INDEX "debts_secured_by_idx" ON "debts" USING btree ("secured_by_type","secured_by_id");
