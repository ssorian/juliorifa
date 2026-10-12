CREATE TABLE "payment_methods" (
	"id" uuid PRIMARY KEY NOT NULL,
	"position" serial NOT NULL,
	"type" text NOT NULL,
	"bank" text NOT NULL,
	"beneficiary" text NOT NULL,
	"number" text NOT NULL,
	"instructions" text DEFAULT '' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"updated_by" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_methods_position_unique" UNIQUE("position"),
	CONSTRAINT "payment_method_type" CHECK ("payment_methods"."type" in ('clabe','card','account')),
	CONSTRAINT "payment_method_number" CHECK (("payment_methods"."type"='clabe' and "payment_methods"."number" ~ '^[0-9]{18}$') or ("payment_methods"."type"='card' and "payment_methods"."number" ~ '^[0-9]{16}$') or ("payment_methods"."type"='account' and "payment_methods"."number" ~ '^[0-9]{1,20}$')),
	CONSTRAINT "payment_method_text" CHECK (length(trim("payment_methods"."bank")) between 1 and 100 and length(trim("payment_methods"."beneficiary")) between 1 and 200 and length("payment_methods"."instructions") <= 2000)
);

--> statement-breakpoint
ALTER TABLE "purchases" ADD COLUMN "payment_methods_snapshot" jsonb;
--> statement-breakpoint
ALTER TABLE "payment_methods" ADD CONSTRAINT "payment_methods_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;
