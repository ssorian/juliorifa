CREATE TABLE "media_assets" (
	"id" uuid PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"kind" text NOT NULL,
	"owner_id" text NOT NULL,
	"raffle_id" uuid,
	"purchase_id" uuid,
	"status" text DEFAULT 'pending' NOT NULL,
	"mime" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"digest" text NOT NULL,
	"width" integer,
	"height" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"verified_at" timestamp with time zone,
	CONSTRAINT "media_assets_key_unique" UNIQUE("key"),
	CONSTRAINT "media_asset_scope" CHECK (("media_assets"."kind"='proof' and "media_assets"."purchase_id" is not null and "media_assets"."raffle_id" is null) or ("media_assets"."kind"='image' and "media_assets"."raffle_id" is not null and "media_assets"."purchase_id" is null)),
	CONSTRAINT "media_asset_status" CHECK ("media_assets"."status" in ('pending','verified','orphan','deleted') and ("media_assets"."status"<>'verified' or "media_assets"."verified_at" is not null)),
	CONSTRAINT "media_asset_size" CHECK ("media_assets"."size_bytes">0 and (("media_assets"."kind"='image' and "media_assets"."size_bytes"<=2097152 and "media_assets"."mime" in ('image/png','image/jpeg','image/webp')) or ("media_assets"."kind"='proof' and "media_assets"."size_bytes"<=10485760 and "media_assets"."mime" in ('image/png','image/jpeg','image/webp','application/pdf'))))
);
--> statement-breakpoint
CREATE TABLE "payment_settings_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"actor_id" text NOT NULL,
	"snapshot" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "purchases" DROP CONSTRAINT "purchase_money_valid";--> statement-breakpoint
ALTER TABLE "purchase_events" ADD COLUMN "reason" text;--> statement-breakpoint
ALTER TABLE "purchases" ADD COLUMN "payment_snapshot" jsonb;--> statement-breakpoint
ALTER TABLE "purchases" ADD COLUMN "proof_asset_id" uuid;--> statement-breakpoint
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_raffle_id_raffles_id_fk" FOREIGN KEY ("raffle_id") REFERENCES "public"."raffles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_purchase_id_purchases_id_fk" FOREIGN KEY ("purchase_id") REFERENCES "public"."purchases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_settings_events" ADD CONSTRAINT "payment_settings_events_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "media_cleanup_idx" ON "media_assets" USING btree ("status","created_at");--> statement-breakpoint
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_proof_asset_id_media_assets_id_fk" FOREIGN KEY ("proof_asset_id") REFERENCES "public"."media_assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchases" ADD CONSTRAINT "purchase_money_valid" CHECK ("purchases"."price_cents">0 and "purchases"."fee_bps" between 0 and 10000 and "purchases"."subtotal_cents">0 and "purchases"."fee_cents">=0 and "purchases"."total_cents"="purchases"."subtotal_cents");