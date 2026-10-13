CREATE TABLE "business_contact" (
	"id" text PRIMARY KEY DEFAULT 'business' NOT NULL,
	"phone" text,
	"whatsapp" text,
	"updated_by" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "business_contact_singleton" CHECK ("business_contact"."id" = 'business'),
	CONSTRAINT "business_contact_phone" CHECK ("business_contact"."phone" is null or "business_contact"."phone" ~ '^\+[1-9][0-9]{7,14}$'),
	CONSTRAINT "business_contact_whatsapp" CHECK ("business_contact"."whatsapp" is null or "business_contact"."whatsapp" ~ '^\+[1-9][0-9]{7,14}$')
);

--> statement-breakpoint
ALTER TABLE "business_contact" ADD CONSTRAINT "business_contact_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;
