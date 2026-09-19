-- A pause is not an ending: contributions stop for a while and resume.
ALTER TABLE "contributions" ADD COLUMN IF NOT EXISTS "paused_from" date;--> statement-breakpoint
ALTER TABLE "contributions" ADD COLUMN IF NOT EXISTS "resumes_on" date;
