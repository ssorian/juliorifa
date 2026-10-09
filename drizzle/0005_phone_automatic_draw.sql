-- Nullable contact preserves legacy accounts; signup enforcement is server-only.
ALTER TABLE "user" ADD COLUMN "phone" text;
--> statement-breakpoint
ALTER TABLE "user" ADD CONSTRAINT "user_phone_valid" CHECK ("phone" IS NULL OR "phone" ~ '^\+[1-9][0-9]{7,14}$');
--> statement-breakpoint
-- Existing draws keep their human actor and default to manual; no fictitious user.
ALTER TABLE "raffle_draws" ADD COLUMN "source" text DEFAULT 'manual' NOT NULL;
--> statement-breakpoint
ALTER TABLE "raffle_draws" ALTER COLUMN "actor_id" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "raffle_draws" ADD CONSTRAINT "draw_source_actor_valid" CHECK (("source" = 'manual' AND "actor_id" IS NOT NULL) OR ("source" = 'automatic' AND "actor_id" IS NULL));
