CREATE SCHEMA "waitlist";
--> statement-breakpoint
CREATE TABLE "waitlist"."entries" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"locale" text NOT NULL,
	"postcode" text,
	"consent_at" timestamp with time zone NOT NULL,
	"leave_token_hash" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "entries_email_unique" UNIQUE("email"),
	CONSTRAINT "entries_leave_token_hash_unique" UNIQUE("leave_token_hash")
);
