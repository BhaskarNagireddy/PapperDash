CREATE SCHEMA "documents";
--> statement-breakpoint
CREATE TABLE "documents"."document_orders" (
	"document_id" text NOT NULL,
	"order_id" text NOT NULL,
	"order_state" text NOT NULL,
	"changed_at" timestamp with time zone NOT NULL,
	CONSTRAINT "document_orders_document_id_order_id_pk" PRIMARY KEY("document_id","order_id")
);
--> statement-breakpoint
CREATE TABLE "documents"."documents" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"file_name" text NOT NULL,
	"content_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"status" text NOT NULL,
	"source_key" text NOT NULL,
	"print_key" text,
	"page_count" integer,
	"rejection_reason" text,
	"retain_until" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "orders"."orders" ADD COLUMN "pages" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "documents"."document_orders" ADD CONSTRAINT "document_orders_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "documents"."documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "document_orders_order_idx" ON "documents"."document_orders" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "documents_owner_idx" ON "documents"."documents" USING btree ("owner_id","created_at");--> statement-breakpoint
CREATE INDEX "documents_retention_idx" ON "documents"."documents" USING btree ("retain_until");