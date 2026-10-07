ALTER TABLE "upload_budgets" ADD COLUMN "active_token" uuid;--> statement-breakpoint
ALTER TABLE "upload_budgets" ADD COLUMN "active_until" timestamp with time zone;