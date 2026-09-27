CREATE SCHEMA "pricing";
--> statement-breakpoint
CREATE TABLE "identity"."external_identities" (
	"provider" text NOT NULL,
	"subject" text NOT NULL,
	"user_id" text NOT NULL,
	"email" text,
	"linked_at" timestamp with time zone NOT NULL,
	CONSTRAINT "external_identities_provider_subject_pk" PRIMARY KEY("provider","subject")
);
--> statement-breakpoint
CREATE TABLE "pricing"."price_lists" (
	"id" text PRIMARY KEY NOT NULL,
	"market" text NOT NULL,
	"currency" text NOT NULL,
	"vat_rate_bp" integer NOT NULL,
	"max_pages" integer NOT NULL,
	"max_file_mb" integer NOT NULL,
	"bw_tiers" jsonb NOT NULL,
	"colour_tiers" jsonb NOT NULL,
	"delivery_fee_minor" integer NOT NULL,
	"active_from" timestamp with time zone NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "identity"."users" ALTER COLUMN "password_hash" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "identity"."external_identities" ADD CONSTRAINT "external_identities_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "identity"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "external_identities_user_idx" ON "identity"."external_identities" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "price_lists_market_active_idx" ON "pricing"."price_lists" USING btree ("market","active_from");