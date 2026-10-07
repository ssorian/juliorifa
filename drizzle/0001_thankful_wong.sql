CREATE TABLE "raffle_draws" (
	"id" uuid PRIMARY KEY NOT NULL,
	"raffle_id" uuid NOT NULL,
	"candidate_digest" text NOT NULL,
	"winner_ticket" integer NOT NULL,
	"winner_order_id" uuid NOT NULL,
	"actor_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "raffle_draws_raffle_id_unique" UNIQUE("raffle_id")
);
--> statement-breakpoint
CREATE TABLE "notification_outbox" (
	"id" uuid PRIMARY KEY NOT NULL,
	"event" text NOT NULL,
	"key" text NOT NULL,
	"payload" jsonb NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "outbox_event_key" UNIQUE("event","key")
);
--> statement-breakpoint
CREATE TABLE "ticket_occupancy" (
	"raffle_id" uuid NOT NULL,
	"ticket_number" integer NOT NULL,
	"state" text NOT NULL,
	"order_id" uuid,
	CONSTRAINT "ticket_occupancy_raffle_id_ticket_number_pk" PRIMARY KEY("raffle_id","ticket_number"),
	CONSTRAINT "occupancy_valid" CHECK ("ticket_occupancy"."ticket_number">0 and (("ticket_occupancy"."state"='blocked' and "ticket_occupancy"."order_id" is null) or ("ticket_occupancy"."state" in ('reserved','reviewing','sold') and "ticket_occupancy"."order_id" is not null)))
);
--> statement-breakpoint
CREATE TABLE "order_tickets" (
	"order_id" uuid NOT NULL,
	"ticket_number" integer NOT NULL,
	CONSTRAINT "order_tickets_order_id_ticket_number_pk" PRIMARY KEY("order_id","ticket_number"),
	CONSTRAINT "order_ticket_positive" CHECK ("order_tickets"."ticket_number">0)
);
--> statement-breakpoint
CREATE TABLE "payment_settings" (
	"id" integer PRIMARY KEY NOT NULL,
	"bank" text NOT NULL,
	"beneficiary" text NOT NULL,
	"account" text NOT NULL,
	"instructions" text NOT NULL,
	"updated_by" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_settings_singleton" CHECK ("payment_settings"."id"=1)
);
--> statement-breakpoint
CREATE TABLE "purchase_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"order_id" uuid NOT NULL,
	"type" text NOT NULL,
	"actor_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "purchases" (
	"id" uuid PRIMARY KEY NOT NULL,
	"raffle_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"payload_digest" text NOT NULL,
	"status" text NOT NULL,
	"price_cents" integer NOT NULL,
	"fee_bps" integer NOT NULL,
	"subtotal_cents" integer NOT NULL,
	"fee_cents" integer NOT NULL,
	"total_cents" integer NOT NULL,
	"proof_key" text,
	"proof_digest" text,
	"proof_received_at" timestamp with time zone,
	"reviewed_at" timestamp with time zone,
	"reviewer_id" text,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "purchase_user_idempotency" UNIQUE("user_id","idempotency_key"),
	CONSTRAINT "purchase_status_valid" CHECK ("purchases"."status" in ('awaiting_proof','reviewing','paid','rejected','expired','cancelled')),
	CONSTRAINT "purchase_money_valid" CHECK ("purchases"."price_cents">0 and "purchases"."fee_bps" between 0 and 10000 and "purchases"."subtotal_cents">0 and "purchases"."fee_cents">=0 and "purchases"."total_cents"="purchases"."subtotal_cents"+"purchases"."fee_cents")
);
--> statement-breakpoint
CREATE TABLE "raffles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"ticket_count" integer NOT NULL,
	"price_cents" integer NOT NULL,
	"fee_bps" integer DEFAULT 0 NOT NULL,
	"sales_deadline" timestamp with time zone NOT NULL,
	"features" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"images" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "raffle_numbers_valid" CHECK ("raffles"."ticket_count" between 1 and 1000000 and "raffles"."price_cents" > 0 and "raffles"."fee_bps" between 0 and 10000),
	CONSTRAINT "raffle_status_valid" CHECK ("raffles"."status" in ('draft','active','paused','scheduled','closed','drawn','archived'))
);
--> statement-breakpoint
ALTER TABLE "raffle_draws" ADD CONSTRAINT "raffle_draws_raffle_id_raffles_id_fk" FOREIGN KEY ("raffle_id") REFERENCES "public"."raffles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "raffle_draws" ADD CONSTRAINT "raffle_draws_winner_order_id_purchases_id_fk" FOREIGN KEY ("winner_order_id") REFERENCES "public"."purchases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "raffle_draws" ADD CONSTRAINT "raffle_draws_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_occupancy" ADD CONSTRAINT "ticket_occupancy_raffle_id_raffles_id_fk" FOREIGN KEY ("raffle_id") REFERENCES "public"."raffles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_occupancy" ADD CONSTRAINT "ticket_occupancy_order_id_purchases_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."purchases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_tickets" ADD CONSTRAINT "order_tickets_order_id_purchases_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."purchases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_settings" ADD CONSTRAINT "payment_settings_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_events" ADD CONSTRAINT "purchase_events_order_id_purchases_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."purchases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_events" ADD CONSTRAINT "purchase_events_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_raffle_id_raffles_id_fk" FOREIGN KEY ("raffle_id") REFERENCES "public"."raffles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_reviewer_id_user_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "purchase_raffle_expiry" ON "purchases" USING btree ("raffle_id","status","expires_at");