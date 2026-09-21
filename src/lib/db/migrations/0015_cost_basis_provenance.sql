CREATE TYPE "public"."cost_basis_source" AS ENUM('plaid', 'manual', 'derived');--> statement-breakpoint
ALTER TABLE "holdings" ADD COLUMN "cost_basis_source" "cost_basis_source";--> statement-breakpoint
ALTER TABLE "holdings" ADD COLUMN "cost_basis_updated_at" timestamp;