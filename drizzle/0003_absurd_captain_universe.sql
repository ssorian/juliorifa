CREATE TABLE "upload_budgets" (
	"user_id" text PRIMARY KEY NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "upload_budget_valid" CHECK ("upload_budgets"."attempts">=0)
);
--> statement-breakpoint
CREATE TABLE "upload_leases" (
	"kind" text NOT NULL,
	"target_id" uuid NOT NULL,
	"owner_id" text NOT NULL,
	"token" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "upload_leases_kind_target_id_pk" PRIMARY KEY("kind","target_id"),
	CONSTRAINT "upload_lease_kind" CHECK ("upload_leases"."kind" in ('proof','image'))
);
--> statement-breakpoint
ALTER TABLE "media_assets" DROP CONSTRAINT "media_asset_status";--> statement-breakpoint
ALTER TABLE "ticket_occupancy" DROP CONSTRAINT "occupancy_valid";--> statement-breakpoint
ALTER TABLE "order_tickets" DROP CONSTRAINT "order_ticket_positive";--> statement-breakpoint
ALTER TABLE "raffles" DROP CONSTRAINT "raffle_numbers_valid";--> statement-breakpoint
ALTER TABLE "raffle_draws" ADD COLUMN "candidate_count" integer;--> statement-breakpoint
ALTER TABLE "raffle_draws" ADD COLUMN "random_index" integer;--> statement-breakpoint
ALTER TABLE "raffle_draws" ADD COLUMN "algorithm" text;--> statement-breakpoint
ALTER TABLE "media_assets" ADD COLUMN "cleanup_token" uuid;--> statement-breakpoint
ALTER TABLE "media_assets" ADD COLUMN "cleanup_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "media_assets" ADD COLUMN "cleanup_attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "media_assets" ADD COLUMN "cleanup_available_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "media_assets" ADD COLUMN "cleanup_dead_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "media_assets" ADD COLUMN "cleanup_error" text;--> statement-breakpoint
ALTER TABLE "notification_outbox" ADD COLUMN "status" text DEFAULT 'ready' NOT NULL;--> statement-breakpoint
ALTER TABLE "notification_outbox" ADD COLUMN "lease_token" uuid;--> statement-breakpoint
ALTER TABLE "notification_outbox" ADD COLUMN "lease_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "notification_outbox" ADD COLUMN "dead_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "notification_outbox" ADD COLUMN "last_error" text;--> statement-breakpoint
ALTER TABLE "raffles" ADD COLUMN "start_number" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "raffles" ADD COLUMN "prize_cost_cents" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "raffles" ADD COLUMN "expenses_cents" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "raffles" ADD COLUMN "draw_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "upload_budgets" ADD CONSTRAINT "upload_budgets_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "upload_leases" ADD CONSTRAINT "upload_leases_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "outbox_ready_idx" ON "notification_outbox" USING btree ("status","available_at");--> statement-breakpoint
ALTER TABLE "raffle_draws" ADD CONSTRAINT "draw_audit_valid" CHECK ("raffle_draws"."winner_ticket">=0 and ("raffle_draws"."candidate_count" is null or ("raffle_draws"."candidate_count">0 and "raffle_draws"."random_index">=0 and "raffle_draws"."random_index"<"raffle_draws"."candidate_count")));--> statement-breakpoint
ALTER TABLE "media_assets" ADD CONSTRAINT "media_asset_status" CHECK ("media_assets"."status" in ('pending','verified','orphan','cleaning','deleted') and ("media_assets"."status"<>'verified' or "media_assets"."verified_at" is not null) and ("media_assets"."status"<>'cleaning' or ("media_assets"."cleanup_token" is not null and "media_assets"."cleanup_until" is not null)) and "media_assets"."cleanup_attempts">=0);--> statement-breakpoint
ALTER TABLE "notification_outbox" ADD CONSTRAINT "outbox_lease_valid" CHECK ("notification_outbox"."attempts">=0 and "notification_outbox"."status" in ('ready','leased','sent','dead') and ("notification_outbox"."status"<>'leased' or ("notification_outbox"."lease_token" is not null and "notification_outbox"."lease_until" is not null)));--> statement-breakpoint
ALTER TABLE "ticket_occupancy" ADD CONSTRAINT "occupancy_valid" CHECK ("ticket_occupancy"."ticket_number">=0 and (("ticket_occupancy"."state"='blocked' and "ticket_occupancy"."order_id" is null) or ("ticket_occupancy"."state" in ('reserved','reviewing','sold') and "ticket_occupancy"."order_id" is not null)));--> statement-breakpoint
ALTER TABLE "order_tickets" ADD CONSTRAINT "order_ticket_positive" CHECK ("order_tickets"."ticket_number">=0);--> statement-breakpoint
ALTER TABLE "raffles" ADD CONSTRAINT "raffle_numbers_valid" CHECK ("raffles"."ticket_count" between 1 and 1000000 and "raffles"."start_number">=0 and "raffles"."start_number"::bigint+"raffles"."ticket_count"-1<=2147483647 and "raffles"."price_cents" > 0 and "raffles"."fee_bps" between 0 and 10000 and "raffles"."prize_cost_cents">=0 and "raffles"."expenses_cents">=0 and ("raffles"."draw_at" is null or "raffles"."draw_at">="raffles"."sales_deadline"));