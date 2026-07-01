CREATE TYPE "public"."inbox_status" AS ENUM('received', 'processed', 'failed', 'dead_letter');--> statement-breakpoint
CREATE TYPE "public"."payment_provider" AS ENUM('clover');--> statement-breakpoint
CREATE TYPE "public"."payment_event_type" AS ENUM('payment');--> statement-breakpoint
CREATE TYPE "public"."sales_source" AS ENUM('clover');--> statement-breakpoint
CREATE TABLE "fcv_payment_inbox_errors" (
	"inbox_id" uuid NOT NULL,
	"attempt_number" integer NOT NULL,
	"request_id" text NOT NULL,
	"error" text NOT NULL,
	CONSTRAINT "fcv_payment_inbox_errors_inbox_id_attempt_number_pk" PRIMARY KEY("inbox_id","attempt_number")
);
--> statement-breakpoint
CREATE TABLE "fcv_payment_inbox" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"status" "inbox_status" NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"occurred_at" timestamp,
	"received_at" timestamp NOT NULL,
	"processed_at" timestamp,
	"provider" "payment_provider" NOT NULL,
	"provider_event_id" text NOT NULL,
	"provider_object_id" text NOT NULL,
	"event_type" "payment_event_type" NOT NULL,
	"payload_json" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fcv_sales" (
	"id" uuid PRIMARY KEY NOT NULL,
	"source" "sales_source" NOT NULL,
	"clover_merchant_id" text,
	"clover_payment_id" text,
	"occurred_at" timestamp with time zone NOT NULL,
	"subtotal_cents" bigint NOT NULL,
	"tax_cents" bigint NOT NULL,
	"discount_cents" bigint NOT NULL,
	"total_cents" bigint NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "sales_subtotal_amount_check" CHECK ("fcv_sales"."subtotal_cents" >= 0),
	CONSTRAINT "sales_discount_amount_check" CHECK ("fcv_sales"."discount_cents" >= 0),
	CONSTRAINT "sales_tax_amount_check" CHECK ("fcv_sales"."tax_cents" >= 0),
	CONSTRAINT "sales_total_amount_check" CHECK ("fcv_sales"."total_cents" >= 0)
);
--> statement-breakpoint
CREATE TABLE "fcv_sales_line_items" (
	"id" uuid PRIMARY KEY NOT NULL,
	"sale_id" uuid NOT NULL,
	"vendor_id" uuid,
	"name" text NOT NULL,
	"quantity" bigint NOT NULL,
	"gross_amount_cents" bigint NOT NULL,
	"discount_amount_cents" bigint NOT NULL,
	"net_amount_cents" bigint NOT NULL,
	"clover_item_id" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "sale_line_items_quantity_check" CHECK ("fcv_sales_line_items"."quantity" > 0),
	CONSTRAINT "sale_line_items_gross_amount_check" CHECK ("fcv_sales_line_items"."gross_amount_cents" >= 0),
	CONSTRAINT "sale_line_items_discount_amount_check" CHECK ("fcv_sales_line_items"."discount_amount_cents" >= 0),
	CONSTRAINT "sale_line_items_net_amount_check" CHECK ("fcv_sales_line_items"."net_amount_cents" >= 0)
);
--> statement-breakpoint
CREATE TABLE "fcv_vendors" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"default_vendor_share" integer DEFAULT 6000 NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "validate_default_vendor_share" CHECK ("fcv_vendors"."default_vendor_share" >= 0 AND "fcv_vendors"."default_vendor_share" <= 10000)
);
--> statement-breakpoint
ALTER TABLE "fcv_payment_inbox_errors" ADD CONSTRAINT "fcv_payment_inbox_errors_inbox_id_fcv_payment_inbox_id_fk" FOREIGN KEY ("inbox_id") REFERENCES "public"."fcv_payment_inbox"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fcv_sales_line_items" ADD CONSTRAINT "fcv_sales_line_items_sale_id_fcv_sales_id_fk" FOREIGN KEY ("sale_id") REFERENCES "public"."fcv_sales"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fcv_sales_line_items" ADD CONSTRAINT "fcv_sales_line_items_vendor_id_fcv_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."fcv_vendors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "payment_inbox_errors_request_id_idx" ON "fcv_payment_inbox_errors" USING btree ("request_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_inbox_idempotency_key_unique" ON "fcv_payment_inbox" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "payment_inbox_request_id_idx" ON "fcv_payment_inbox" USING btree ("request_id");--> statement-breakpoint
CREATE INDEX "payment_inbox_status_received_at_idx" ON "fcv_payment_inbox" USING btree ("status","received_at");--> statement-breakpoint
CREATE INDEX "sales_occurred_at_idx" ON "fcv_sales" USING btree ("occurred_at");--> statement-breakpoint
CREATE INDEX "sale_line_items_sale_id_idx" ON "fcv_sales_line_items" USING btree ("sale_id");--> statement-breakpoint
CREATE INDEX "sale_line_items_vendor_id_idx" ON "fcv_sales_line_items" USING btree ("vendor_id");