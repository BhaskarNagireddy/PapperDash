CREATE SCHEMA "payments";
--> statement-breakpoint
CREATE TABLE "payments"."payments" (
	"id" text PRIMARY KEY NOT NULL,
	"order_id" text NOT NULL,
	"customer_id" text NOT NULL,
	"attempt" integer NOT NULL,
	"provider" text NOT NULL,
	"provider_payment_id" text NOT NULL,
	"amount_minor" integer NOT NULL,
	"currency" text NOT NULL,
	"status" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"succeeded_at" timestamp with time zone,
	CONSTRAINT "payments_provider_payment_id_unique" UNIQUE("provider_payment_id"),
	CONSTRAINT "payments_order_attempt_uq" UNIQUE("order_id","attempt")
);
--> statement-breakpoint
CREATE TABLE "payments"."refunds" (
	"id" text PRIMARY KEY NOT NULL,
	"payment_id" text NOT NULL,
	"order_id" text NOT NULL,
	"provider_refund_id" text,
	"amount_minor" integer NOT NULL,
	"currency" text NOT NULL,
	"full" boolean NOT NULL,
	"reason" text NOT NULL,
	"requested_by" text NOT NULL,
	"status" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "refunds_provider_refund_id_unique" UNIQUE("provider_refund_id")
);
--> statement-breakpoint
CREATE TABLE "payments"."webhook_events" (
	"provider" text NOT NULL,
	"event_id" text NOT NULL,
	"kind" text NOT NULL,
	"received_at" timestamp with time zone NOT NULL,
	CONSTRAINT "webhook_events_provider_event_id_pk" PRIMARY KEY("provider","event_id")
);
--> statement-breakpoint
ALTER TABLE "payments"."refunds" ADD CONSTRAINT "refunds_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "payments"."payments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "payments_order_idx" ON "payments"."payments" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "refunds_payment_idx" ON "payments"."refunds" USING btree ("payment_id");