ALTER TABLE "account_snapshots" ALTER COLUMN "cost_basis" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "holdings" ALTER COLUMN "cost_basis_per_share" DROP NOT NULL;