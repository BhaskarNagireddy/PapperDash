CREATE TABLE "platform"."leases" (
	"name" text PRIMARY KEY NOT NULL,
	"holder" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "platform"."rate_limits" (
	"key" text NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"count" integer NOT NULL,
	CONSTRAINT "rate_limits_key_window_start_pk" PRIMARY KEY("key","window_start")
);
--> statement-breakpoint
CREATE INDEX "rate_limits_window_idx" ON "platform"."rate_limits" USING btree ("window_start");